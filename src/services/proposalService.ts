import { supabaseClient } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { getBrandSlugFromUuid, getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug, type ClientLanguage, type ClientMarketType, type LineItem, type PricingCatalogKey, type TaxCode, type TaxLine } from '@/types'
import { getMainPackageTemplateByName, resolveMappedPackageTemplateName } from '@/services/productsServicesService'
import { fetchPricingInputProfile } from '@/services/serviceCatalogComposerService'
import { fetchFinancialSettingsByBrandId } from '@/services/financialSettingsService'
import { resolveFinancialDefaultCurrency } from '@/services/financialCurrencyService'
import { resolveFinancialTaxToggleDefaults } from '@/services/financialTaxService'
import { fetchPaymentScheduleSettingsByBrandId } from '@/services/paymentScheduleSettingsService'
import { addDaysToDate, buildPaymentScheduleFromTemplates } from '@/services/paymentScheduleService'

type ProposalRow = Database['public']['Tables']['proposals']['Row']
type InvoiceInsert = Database['public']['Tables']['invoices']['Insert']
type LeadPayableInsert = Database['public']['Tables']['lead_payables']['Insert']

type TaxToggleMap = Record<TaxCode, boolean>

const TAX_CODES: TaxCode[] = ['IVA', 'IVA_RET', 'ISR', 'ISR_RET']

interface FetchProposalOptions {
  leadId?: string
  proposalId?: string
}

interface FetchLeadProposalsOptions {
  statuses?: ProposalRow['status'][]
}

interface EnsureProposalOptions {
  leadId: string
  currency?: string
  marketSnapshot?: ProposalMarketSnapshot
}

export interface ProposalSummary {
  id: string
  status: ProposalRow['status']
  currency: string
  dateSent: string | null
  marketSnapshot?: ProposalMarketSnapshot
  selectedPaymentScheduleId?: string
  selectedContractTemplateId?: string
  hasExplicitPaymentSchedule: boolean
  paymentScheduleAudit?: ProposalPaymentScheduleAudit
  paymentScheduleAuditHistory: ProposalPaymentScheduleAudit[]
  recipients: ProposalRecipient[]
  lineItems: LineItem[]
  taxes: TaxLine[]
  subtotal: number
  totalAmount: number
  taxToggleDefaults: TaxToggleMap
}

export type ProposalPaymentScheduleAuditAction =
  | 'applied_explicit_schedule'
  | 'cleared_explicit_schedule'

export interface ProposalPaymentScheduleAudit {
  action: ProposalPaymentScheduleAuditAction
  at: string
  scheduleId?: string
  performedBy?: string
}

export interface ProposalMarketSnapshot {
  clientType: ClientMarketType
  language: ClientLanguage
  catalogKey: PricingCatalogKey
  currency: 'USD' | 'MXN'
  snapshottedAt: string
}

export interface ProposalRecipient {
  [key: string]: string | boolean | undefined
  name: string
  email: string
  role: string
  selected: boolean
  isCustom?: boolean
}

export interface ProposalPayablesPreviewLine {
  lineItemLabel: string
  quantity: number
  matchedTemplateName: string | null
  revenue: number
  labor: number
  admin: number
  sales: number
  planner: number
  paymentFee: number
  profit: number
  commission: number
  total: number
}

export interface ProposalPayablesPreview {
  dueDate: string
  currency: string
  lines: ProposalPayablesPreviewLine[]
  totals: {
    revenue: number
    labor: number
    admin: number
    sales: number
    planner: number
    paymentFee: number
    profit: number
    commission: number
    total: number
  }
  unmatchedLineItems: string[]
}

export interface ProposalListItem {
  id: string
  status: ProposalRow['status']
  currency: string
  totalAmount: number
  dateSent: string | null
  validUntil: string | null
  updatedAt: string
  hasExplicitPaymentSchedule: boolean
  paymentScheduleAudit?: ProposalPaymentScheduleAudit
}

export async function fetchLatestProposal(brandSlug: BrandSlug, options?: FetchProposalOptions): Promise<ProposalSummary | null> {
  const brandUuid = await getBrandUuidFromSlug(brandSlug)
  const defaultCurrency = await resolveFinancialDefaultCurrency(brandUuid)

  let query = supabaseClient
    .from('proposals')
    .select('id, status, line_items, taxes, subtotal, total_amount, currency, lead_id, payment_schedule, updated_at')
    .eq('brand_id', brandUuid)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (options?.leadId) {
    query = query.eq('lead_id', options.leadId)
  }

  if (options?.proposalId) {
    query = query.eq('id', options.proposalId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  const lineItems = normalizeLineItems(data.line_items)
  const taxes = normalizeTaxLines(data.taxes)
  const marketSnapshot = extractMarketSnapshot(data.payment_schedule)
  const recipients = extractProposalRecipients(data.payment_schedule)

  return {
    id: data.id,
    status: data.status,
    currency: data.currency ?? defaultCurrency,
    dateSent: getQuoteSentAt(data.payment_schedule)
      ?? (data.status === 'sent' || data.status === 'accepted' ? data.updated_at : null),
    marketSnapshot,
    selectedPaymentScheduleId: extractSelectedPaymentScheduleId(data.payment_schedule),
    selectedContractTemplateId: extractSelectedContractTemplateId(data.payment_schedule),
    hasExplicitPaymentSchedule: hasExplicitPaymentSchedule(data.payment_schedule),
    paymentScheduleAudit: extractPaymentScheduleAudit(data.payment_schedule),
    paymentScheduleAuditHistory: extractPaymentScheduleAuditHistory(data.payment_schedule),
    recipients,
    lineItems,
    taxes,
    subtotal: data.subtotal ?? summarizeSubtotal(lineItems),
    totalAmount: data.total_amount ?? summarizeSubtotal(lineItems),
    taxToggleDefaults: await buildTaxToggleDefaults(taxes, brandUuid),
  }
}

export async function fetchLeadProposals(
  brandSlug: BrandSlug,
  leadId: string,
  options?: FetchLeadProposalsOptions,
): Promise<ProposalListItem[]> {
  const brandUuid = await getBrandUuidFromSlug(brandSlug)
  const defaultCurrency = await resolveFinancialDefaultCurrency(brandUuid)

  let query = supabaseClient
    .from('proposals')
    .select('id, status, total_amount, currency, valid_until, updated_at, payment_schedule')
    .eq('brand_id', brandUuid)
    .eq('lead_id', leadId)

  const statuses = options?.statuses?.filter(Boolean) ?? []
  if (statuses.length) {
    query = query.in('status', statuses)
  }

  const { data, error } = await query.order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((proposal) => ({
    id: proposal.id,
    status: proposal.status,
    currency: proposal.currency ?? defaultCurrency,
    totalAmount: proposal.total_amount ?? 0,
    dateSent: getQuoteSentAt(proposal.payment_schedule)
      ?? (proposal.status === 'sent' || proposal.status === 'accepted' ? proposal.updated_at : null),
    validUntil: proposal.valid_until,
    updatedAt: proposal.updated_at,
    hasExplicitPaymentSchedule: hasExplicitPaymentSchedule(proposal.payment_schedule),
    paymentScheduleAudit: extractPaymentScheduleAudit(proposal.payment_schedule),
  }))
}

function getQuoteSentAt(paymentSchedule: unknown): string | null {
  if (!paymentSchedule || typeof paymentSchedule !== 'object' || Array.isArray(paymentSchedule)) {
    return null
  }

  const value = (paymentSchedule as Record<string, unknown>).quoteSentAt
  return typeof value === 'string' && value.trim() ? value : null
}

export async function ensureDraftProposalForLead(
  brandSlug: BrandSlug,
  options: EnsureProposalOptions,
): Promise<ProposalSummary> {
  const existing = await fetchLatestProposal(brandSlug, { leadId: options.leadId })
  if (existing) {
    return existing
  }

  const brandUuid = await getBrandUuidFromSlug(brandSlug)
  const draftCurrency = await resolveDraftProposalCurrency(brandUuid, options)
  const paymentSchedule = mergePaymentScheduleWithMarketSnapshot([], options.marketSnapshot)

  const { data, error } = await supabaseClient
    .from('proposals')
    .insert({
      lead_id: options.leadId,
      brand_id: brandUuid,
      line_items: [] as unknown as Database['public']['Tables']['proposals']['Insert']['line_items'],
      taxes: [] as unknown as Database['public']['Tables']['proposals']['Insert']['taxes'],
      subtotal: 0,
      total_amount: 0,
      status: 'draft',
      currency: draftCurrency,
      payment_schedule: paymentSchedule,
      updated_at: new Date().toISOString(),
    })
    .select('id, status, line_items, taxes, subtotal, total_amount, currency, payment_schedule')
    .single()

  if (error || !data) {
    throw error ?? new Error('Unable to create draft proposal')
  }

  const lineItems = normalizeLineItems(data.line_items)
  const taxes = normalizeTaxLines(data.taxes)
  const marketSnapshot = extractMarketSnapshot(data.payment_schedule)
  const recipients = extractProposalRecipients(data.payment_schedule)

  return {
    id: data.id,
    status: data.status,
    currency: data.currency ?? draftCurrency,
    dateSent: null,
    marketSnapshot,
    selectedPaymentScheduleId: extractSelectedPaymentScheduleId(data.payment_schedule),
    selectedContractTemplateId: extractSelectedContractTemplateId(data.payment_schedule),
    hasExplicitPaymentSchedule: hasExplicitPaymentSchedule(data.payment_schedule),
    paymentScheduleAudit: extractPaymentScheduleAudit(data.payment_schedule),
    paymentScheduleAuditHistory: extractPaymentScheduleAuditHistory(data.payment_schedule),
    recipients,
    lineItems,
    taxes,
    subtotal: data.subtotal ?? summarizeSubtotal(lineItems),
    totalAmount: data.total_amount ?? summarizeSubtotal(lineItems),
    taxToggleDefaults: await buildTaxToggleDefaults(taxes, brandUuid),
  }
}

async function resolveDraftProposalCurrency(
  brandUuid: string,
  options: EnsureProposalOptions,
): Promise<'USD' | 'MXN'> {
  if (options.currency === 'USD' || options.currency === 'MXN') {
    return options.currency
  }

  if (options.marketSnapshot?.currency === 'USD' || options.marketSnapshot?.currency === 'MXN') {
    return options.marketSnapshot.currency
  }

  return resolveFinancialDefaultCurrency(brandUuid)
}

export async function acceptProposal(proposalId: string) {
  const { data: proposal, error: proposalError } = await supabaseClient
    .from('proposals')
    .select('id, lead_id, brand_id, line_items, taxes, total_amount, currency, payment_schedule')
    .eq('id', proposalId)
    .maybeSingle()

  if (proposalError || !proposal) {
    throw proposalError ?? new Error('Proposal not found')
  }

  const { error } = await supabaseClient
    .from('proposals')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', proposalId)

  if (error) {
    throw error
  }

  const { count: existingInvoiceCount, error: invoiceCountError } = await supabaseClient
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('proposal_id', proposalId)

  if (invoiceCountError) {
    throw invoiceCountError
  }

  if ((existingInvoiceCount ?? 0) > 0) {
    return
  }

  const eventId = await ensureEventForLead(proposal.lead_id, proposal.brand_id)
  const marketSnapshot = extractMarketSnapshot(proposal.payment_schedule)
  const currency = proposal.currency ?? await resolveFinancialDefaultCurrency(proposal.brand_id)
  const issuedAt = new Date().toISOString().slice(0, 10)
  const eventDueDate = await resolveEventDueDate(leadIdFromProposal(proposal), eventId, issuedAt)
  const fallbackInvoiceDueDate = await resolveInvoiceFallbackDueDate(proposal.brand_id, issuedAt)
  const explicitPaymentSchedule = normalizePaymentSchedule(proposal.payment_schedule, fallbackInvoiceDueDate)
  const paymentSchedule = explicitPaymentSchedule.length
    ? explicitPaymentSchedule
    : await buildDefaultPaymentScheduleFromSettings({
      brandId: proposal.brand_id,
      issuedAt,
      jobDate: eventDueDate,
      proposalTotal: Number(proposal.total_amount ?? 0),
      fallbackDueDate: fallbackInvoiceDueDate,
      selectedScheduleId: extractSelectedPaymentScheduleId(proposal.payment_schedule),
    })
  const proposalTotal = Number(proposal.total_amount ?? 0)

  const invoiceDrafts: InvoiceInsert[] = paymentSchedule.length
    ? paymentSchedule.map((item, index) => ({
        event_id: eventId,
        proposal_id: proposal.id,
        brand_id: proposal.brand_id,
        invoice_number: createInvoiceNumber(index + 1),
        line_items: [
          {
            id: `${proposal.id}-${index + 1}`,
            description: item.label || `Payment ${index + 1}`,
            quantity: 1,
            unitPrice: item.amount,
            discounts: 0,
          },
        ] as Database['public']['Tables']['invoices']['Insert']['line_items'],
        subtotal: item.amount,
        taxes: [] as Database['public']['Tables']['invoices']['Insert']['taxes'],
        total_amount: item.amount,
        amount_due: item.amount,
        status: 'unpaid',
        due_date: item.dueDate,
        issued_at: issuedAt,
        currency,
        payments: [] as Database['public']['Tables']['invoices']['Insert']['payments'],
      }))
    : [
        {
          event_id: eventId,
          proposal_id: proposal.id,
          brand_id: proposal.brand_id,
          invoice_number: createInvoiceNumber(1),
          line_items: normalizeLineItems(proposal.line_items) as unknown as Database['public']['Tables']['invoices']['Insert']['line_items'],
          subtotal: proposalTotal,
          taxes: normalizeTaxLines(proposal.taxes) as unknown as Database['public']['Tables']['invoices']['Insert']['taxes'],
          total_amount: proposalTotal,
          amount_due: proposalTotal,
          status: 'unpaid',
          due_date: fallbackInvoiceDueDate,
          issued_at: issuedAt,
          currency,
          payments: [] as Database['public']['Tables']['invoices']['Insert']['payments'],
        },
      ]

  const { error: createInvoicesError } = await supabaseClient
    .from('invoices')
    .insert(invoiceDrafts)

  if (createInvoicesError) {
    throw createInvoicesError
  }

  await createPayablesForAcceptedProposal({
    proposalId: proposal.id,
    leadId: proposal.lead_id,
    brandId: proposal.brand_id,
    eventId,
    dueDate: eventDueDate,
    lineItems: normalizeLineItems(proposal.line_items),
    pricingCatalogKey: marketSnapshot?.catalogKey,
    payableCurrency: currency,
  })
}

export async function fetchProposalPayablesPreview(proposalId: string): Promise<ProposalPayablesPreview | null> {
  const { data: proposal, error } = await supabaseClient
    .from('proposals')
    .select('id, lead_id, brand_id, line_items, payment_schedule, currency')
    .eq('id', proposalId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!proposal) {
    return null
  }

  const lineItems = normalizeLineItems(proposal.line_items)
  const dueDate = await resolveProjectedDueDate(proposal.lead_id)
  const marketSnapshot = extractMarketSnapshot(proposal.payment_schedule)
  const breakdown = await buildPayableRowsFromLineItems({
    leadId: proposal.lead_id,
    brandId: proposal.brand_id,
    eventId: null,
    dueDate,
    lineItems,
    notes: null,
    pricingCatalogKey: marketSnapshot?.catalogKey,
    payableCurrency: proposal.currency ?? await resolveFinancialDefaultCurrency(proposal.brand_id),
  })

  return {
    dueDate,
    currency: proposal.currency ?? await resolveFinancialDefaultCurrency(proposal.brand_id),
    lines: breakdown.previewLines,
    totals: {
      revenue: roundMoney(breakdown.previewLines.reduce((sum, line) => sum + line.revenue, 0)),
      labor: roundMoney(breakdown.previewLines.reduce((sum, line) => sum + line.labor, 0)),
      admin: roundMoney(breakdown.previewLines.reduce((sum, line) => sum + line.admin, 0)),
      sales: roundMoney(breakdown.previewLines.reduce((sum, line) => sum + line.sales, 0)),
      planner: roundMoney(breakdown.previewLines.reduce((sum, line) => sum + line.planner, 0)),
      paymentFee: roundMoney(breakdown.previewLines.reduce((sum, line) => sum + line.paymentFee, 0)),
      profit: roundMoney(breakdown.previewLines.reduce((sum, line) => sum + line.profit, 0)),
      commission: roundMoney(breakdown.previewLines.reduce((sum, line) => sum + line.commission, 0)),
      total: roundMoney(breakdown.previewLines.reduce((sum, line) => sum + line.total, 0)),
    },
    unmatchedLineItems: breakdown.unmatchedLineItems,
  }
}

interface UpdateProposalLineItemsInput {
  lineItems: LineItem[]
  taxes: TaxLine[]
  currency: string
  marketSnapshot?: ProposalMarketSnapshot
  recipients?: ProposalRecipient[]
  selectedPaymentScheduleId?: string | null
  selectedContractTemplateId?: string | null
  paymentScheduleAuditEvent?: ProposalPaymentScheduleAudit
  explicitPaymentSchedule?: Array<{
    label: string
    amount: number
    dueDate: string
  }> | null
}

export async function updateProposalLineItems(
  proposalId: string,
  payload: UpdateProposalLineItemsInput,
) {
  const { data: existingProposal, error: existingProposalError } = await supabaseClient
    .from('proposals')
    .select('payment_schedule')
    .eq('id', proposalId)
    .maybeSingle()

  if (existingProposalError) {
    throw existingProposalError
  }

  const subtotal = summarizeSubtotal(payload.lineItems)
  const totalTaxes = payload.taxes.reduce((acc, tax) => acc + tax.amount * (tax.isWithheld ? -1 : 1), 0)
  const totalAmount = Number((subtotal + totalTaxes).toFixed(2))
  const paymentScheduleWithSnapshot = mergePaymentScheduleWithMarketSnapshot(
    existingProposal?.payment_schedule,
    payload.marketSnapshot,
    payload.recipients,
    payload.selectedPaymentScheduleId,
    payload.selectedContractTemplateId,
    payload.paymentScheduleAuditEvent,
    payload.explicitPaymentSchedule,
  )

  const { error } = await supabaseClient
    .from('proposals')
    .update({
      line_items: payload.lineItems as unknown as Database['public']['Tables']['proposals']['Update']['line_items'],
      taxes: payload.taxes as unknown as Database['public']['Tables']['proposals']['Update']['taxes'],
      subtotal,
      total_amount: totalAmount,
      currency: payload.currency,
      payment_schedule: paymentScheduleWithSnapshot,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposalId)

  if (error) {
    throw error
  }
}

interface CreatePayablesInput {
  proposalId: string
  leadId: string
  brandId: string
  eventId: string
  dueDate: string
  lineItems: LineItem[]
  pricingCatalogKey?: PricingCatalogKey
  payableCurrency?: string
}

async function createPayablesForAcceptedProposal(input: CreatePayablesInput) {
  const marker = `proposal:${input.proposalId}`

  const { count: existingCount, error: existingError } = await supabaseClient
    .from('lead_payables')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', input.leadId)
    .eq('event_id', input.eventId)
    .eq('notes', marker)

  if (existingError) {
    throw existingError
  }

  if ((existingCount ?? 0) > 0) {
    return
  }

  const built = await buildPayableRowsFromLineItems({
    leadId: input.leadId,
    brandId: input.brandId,
    eventId: input.eventId,
    dueDate: input.dueDate,
    lineItems: input.lineItems,
    notes: marker,
    pricingCatalogKey: input.pricingCatalogKey,
    payableCurrency: input.payableCurrency,
  })

  const rows = built.rows

  if (!rows.length) {
    return
  }

  const { error } = await supabaseClient
    .from('lead_payables')
    .insert(rows)

  if (error) {
    throw error
  }
}

interface BuildPayablesFromLineItemsInput {
  leadId: string
  brandId: string
  eventId: string | null
  dueDate: string
  lineItems: LineItem[]
  notes: string | null
  pricingCatalogKey?: PricingCatalogKey
  payableCurrency?: string
}

interface BuildPayablesFromLineItemsResult {
  rows: LeadPayableInsert[]
  previewLines: ProposalPayablesPreviewLine[]
  unmatchedLineItems: string[]
}

async function buildPayableRowsFromLineItems(input: BuildPayablesFromLineItemsInput): Promise<BuildPayablesFromLineItemsResult> {
  const brandSlug = await getBrandSlugFromUuid(input.brandId)
  const resolvedBrandSlug: BrandSlug = brandSlug ?? 'amo'
  const payableCurrency = input.payableCurrency ?? await resolveFinancialDefaultCurrency(input.brandId)
  const pricingProfile = await fetchPricingInputProfile(resolvedBrandSlug, input.pricingCatalogKey ?? 'INT_USD_ENG')
  const rows: LeadPayableInsert[] = []
  const previewLines: ProposalPayablesPreviewLine[] = []
  const unmatchedLineItems: string[] = []

  input.lineItems.forEach((item) => {
    const match = resolveTemplateForLineItem(item.description, resolvedBrandSlug)
    const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1

    const revenue = roundMoney(Math.max(0, item.unitPrice * quantity))
    if (revenue <= 0) {
      return
    }

    if (!match.template) {
      unmatchedLineItems.push(item.description)
    }

    const fallbackLabor = match.template ? roundMoney(match.template.breakdown.labor * quantity) : 0
    const labor = roundMoney((Number.isFinite(item.internalCost) ? Number(item.internalCost) : fallbackLabor) * quantity)
    const admin = roundMoney(revenue * (pricingProfile.adminPercent / 100))
    const sales = roundMoney(revenue * (pricingProfile.salesPercent / 100))
    const planner = roundMoney(revenue * (pricingProfile.plannerPercent / 100))
    const paymentFee = roundMoney(revenue * (pricingProfile.paymentFeePercent / 100))
    const commission = roundMoney(sales + planner)
    const total = roundMoney(labor + admin + sales + planner + paymentFee)
    const profit = roundMoney(Math.max(0, revenue - total))

    previewLines.push({
      lineItemLabel: item.description,
      quantity,
      matchedTemplateName: match.template?.name ?? null,
      revenue,
      labor,
      admin,
      sales,
      planner,
      paymentFee,
      profit,
      commission,
      total,
    })

    rows.push(
      {
        lead_id: input.leadId,
        event_id: input.eventId,
        brand_id: input.brandId,
        title: `${item.description} - Labor`,
        category: 'labor',
        amount: labor,
        currency: payableCurrency,
        due_date: input.dueDate,
        status: 'planned',
        source: 'package_component',
        notes: input.notes,
      },
      {
        lead_id: input.leadId,
        event_id: input.eventId,
        brand_id: input.brandId,
        title: `${item.description} - Admin`,
        category: 'admin',
        amount: admin,
        currency: payableCurrency,
        due_date: input.dueDate,
        status: 'planned',
        source: 'package_component',
        notes: input.notes,
      },
      {
        lead_id: input.leadId,
        event_id: input.eventId,
        brand_id: input.brandId,
        title: `${item.description} - Sales Commission`,
        category: 'commission',
        amount: sales,
        currency: payableCurrency,
        due_date: input.dueDate,
        status: 'scheduled',
        source: 'commission',
        notes: input.notes,
      },
      {
        lead_id: input.leadId,
        event_id: input.eventId,
        brand_id: input.brandId,
        title: `${item.description} - Planner/Venue Commission`,
        category: 'commission',
        amount: planner,
        currency: payableCurrency,
        due_date: input.dueDate,
        status: 'scheduled',
        source: 'commission',
        notes: input.notes,
      },
      {
        lead_id: input.leadId,
        event_id: input.eventId,
        brand_id: input.brandId,
        title: `${item.description} - Online Payment Fee`,
        category: 'fees',
        amount: paymentFee,
        currency: payableCurrency,
        due_date: input.dueDate,
        status: 'planned',
        source: 'adjustment',
        notes: input.notes,
      },
    )
  })

  return {
    rows,
    previewLines,
    unmatchedLineItems,
  }
}

function resolveTemplateForLineItem(lineItemLabel: string, brandSlug: BrandSlug | undefined) {
  const exactName = lineItemLabel.trim()
  const mappedName = brandSlug ? resolveMappedPackageTemplateName(brandSlug, exactName) : null
  const template = getMainPackageTemplateByName(exactName) ?? (mappedName ? getMainPackageTemplateByName(mappedName) : null)
  return {
    template,
    mappedName,
  }
}

function leadIdFromProposal(proposal: { lead_id: string }) {
  return proposal.lead_id
}

async function resolveEventDueDate(leadId: string, eventId: string, fallback: string) {
  const { data: eventRow, error: eventError } = await supabaseClient
    .from('events')
    .select('start_time')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    throw eventError
  }

  if (eventRow?.start_time) {
    return eventRow.start_time.slice(0, 10)
  }

  const { data: leadRow, error: leadError } = await supabaseClient
    .from('leads')
    .select('event_date')
    .eq('id', leadId)
    .maybeSingle()

  if (leadError) {
    throw leadError
  }

  return leadRow?.event_date ?? fallback
}

async function resolveProjectedDueDate(leadId: string) {
  const { data: eventRow, error: eventError } = await supabaseClient
    .from('events')
    .select('start_time')
    .eq('lead_id', leadId)
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (eventError) {
    throw eventError
  }

  if (eventRow?.start_time) {
    return eventRow.start_time.slice(0, 10)
  }

  const { data: leadRow, error: leadError } = await supabaseClient
    .from('leads')
    .select('event_date')
    .eq('id', leadId)
    .maybeSingle()

  if (leadError) {
    throw leadError
  }

  return leadRow?.event_date ?? new Date().toISOString().slice(0, 10)
}

async function resolveInvoiceFallbackDueDate(brandId: string, issuedAt: string) {
  try {
    const financialSettings = await fetchFinancialSettingsByBrandId(brandId)
    const dueDays = Number.isFinite(financialSettings.defaultInvoiceDueDays)
      ? Math.max(0, Math.round(financialSettings.defaultInvoiceDueDays))
      : 0
    return addDaysToDate(issuedAt, dueDays)
  } catch (error) {
    console.error('Unable to resolve financial settings due date fallback', error)
    return issuedAt
  }
}

interface BuildDefaultPaymentScheduleInput {
  brandId: string
  issuedAt: string
  jobDate?: string
  proposalTotal: number
  fallbackDueDate: string
  selectedScheduleId?: string
}

async function buildDefaultPaymentScheduleFromSettings(
  input: BuildDefaultPaymentScheduleInput,
): Promise<PaymentScheduleEntry[]> {
  if (!Number.isFinite(input.proposalTotal) || input.proposalTotal <= 0) {
    return []
  }

  try {
    const settings = await fetchPaymentScheduleSettingsByBrandId(input.brandId)
    if (!settings.applyByDefaultWhenMissing) {
      return []
    }

    const defaultSchedule = settings.schedules.find((schedule) => schedule.id === input.selectedScheduleId)
      ?? settings.schedules.find((schedule) => schedule.isDefault)
      ?? settings.schedules[0]

    if (!defaultSchedule?.templates?.length) {
      return []
    }

    const computed = buildPaymentScheduleFromTemplates({
      templates: defaultSchedule.templates,
      totalAmount: input.proposalTotal,
      keyDates: {
        issuedAt: input.issuedAt,
        orderBookedAt: input.issuedAt,
        acceptanceDate: input.issuedAt,
        deliveryDate: input.jobDate,
        jobDate: input.jobDate,
      },
    })

    return computed.map((entry, index) => ({
      label: entry.label || `Payment ${index + 1}`,
      amount: entry.amount,
      dueDate: entry.dueDate || input.fallbackDueDate,
    }))
  } catch (error) {
    console.error('Unable to build default payment schedule from settings', error)
    return []
  }
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

interface PaymentScheduleEntry {
  label: string
  amount: number
  dueDate: string
}

function normalizePaymentSchedule(payload: ProposalRow['payment_schedule'], fallbackDueDate: string): PaymentScheduleEntry[] {
  const entries = extractScheduleEntries(payload)

  return entries
    .map((entry, index) => ({
      label: entry.label?.trim() || `Payment ${index + 1}`,
      amount: Number(entry.amount ?? 0),
      dueDate: (entry.dueDate || entry.due_date || fallbackDueDate).slice(0, 10),
    }))
    .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0)
}

async function ensureEventForLead(leadId: string, brandId: string) {
  const { data: existingEvent, error: eventError } = await supabaseClient
    .from('events')
    .select('id')
    .eq('lead_id', leadId)
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (eventError) {
    throw eventError
  }

  if (existingEvent?.id) {
    return existingEvent.id
  }

  const { data: leadRow, error: leadError } = await supabaseClient
    .from('leads')
    .select('event_date')
    .eq('id', leadId)
    .maybeSingle()

  if (leadError) {
    throw leadError
  }

  const startTime = leadRow?.event_date ? `${leadRow.event_date}T23:00:00.000Z` : null

  const { data: insertedEvent, error: createEventError } = await supabaseClient
    .from('events')
    .insert({
      lead_id: leadId,
      brand_id: brandId,
      title: 'Booked Event',
      start_time: startTime,
      end_time: null,
      location: {},
      shoot_type: 'hybrid',
    })
    .select('id')
    .single()

  if (createEventError || !insertedEvent) {
    throw createEventError ?? new Error('Unable to create event')
  }

  return insertedEvent.id
}

function createInvoiceNumber(sequence: number) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `INV-${datePart}-${String(sequence).padStart(2, '0')}-${randomPart}`
}

function normalizeLineItems(payload: ProposalRow['line_items']): LineItem[] {
  if (!payload) return []
  if (Array.isArray(payload)) {
    return payload as unknown as LineItem[]
  }
  return []
}

function normalizeTaxLines(payload: ProposalRow['taxes']): TaxLine[] {
  if (!payload) return []
  if (Array.isArray(payload)) {
    return (payload as unknown as TaxLine[]).map((tax) => ({
      ...tax,
      isWithheld: Boolean(tax.isWithheld),
    }))
  }
  return []
}

async function buildTaxToggleDefaults(taxes: TaxLine[], brandId: string): Promise<TaxToggleMap> {
  if (!taxes.length) {
    return resolveFinancialTaxToggleDefaults(brandId)
  }

  return TAX_CODES.reduce<TaxToggleMap>((acc, code) => {
    acc[code] = taxes.some((tax) => tax.code === code)
    return acc
  }, {
    IVA: false,
    IVA_RET: false,
    ISR: false,
    ISR_RET: false,
  })
}

function summarizeSubtotal(items: LineItem[]): number {
  return items.reduce((acc, item) => acc + item.quantity * item.unitPrice - (item.discounts ?? 0), 0)
}

type PaymentScheduleRawEntry = { label?: string; amount?: number; dueDate?: string; due_date?: string }

function extractScheduleEntries(payload: ProposalRow['payment_schedule']): PaymentScheduleRawEntry[] {
  if (Array.isArray(payload)) {
    return payload as PaymentScheduleRawEntry[]
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const candidate = payload as { schedule?: unknown }
    if (Array.isArray(candidate.schedule)) {
      return candidate.schedule as PaymentScheduleRawEntry[]
    }
  }

  return []
}

function hasExplicitPaymentSchedule(payload: ProposalRow['payment_schedule']): boolean {
  return extractScheduleEntries(payload).some((entry) => {
    const amount = Number(entry.amount ?? 0)
    return Number.isFinite(amount) && amount > 0
  })
}

function extractMarketSnapshot(payload: ProposalRow['payment_schedule']): ProposalMarketSnapshot | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  const candidate = payload as { marketSnapshot?: unknown }
  if (!candidate.marketSnapshot || typeof candidate.marketSnapshot !== 'object' || Array.isArray(candidate.marketSnapshot)) {
    return undefined
  }

  const snapshot = candidate.marketSnapshot as Partial<ProposalMarketSnapshot>
  if (!isProposalMarketSnapshot(snapshot)) {
    return undefined
  }

  return snapshot
}

function extractProposalRecipients(payload: ProposalRow['payment_schedule']): ProposalRecipient[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return []
  }

  const candidate = payload as { recipients?: unknown }
  if (!Array.isArray(candidate.recipients)) {
    return []
  }

  return sanitizeProposalRecipients(candidate.recipients)
}

function extractSelectedPaymentScheduleId(payload: ProposalRow['payment_schedule']): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  const candidate = payload as { selectedPaymentScheduleId?: unknown }
  if (typeof candidate.selectedPaymentScheduleId !== 'string') {
    return undefined
  }

  const trimmed = candidate.selectedPaymentScheduleId.trim()
  return trimmed || undefined
}

function extractSelectedContractTemplateId(payload: ProposalRow['payment_schedule']): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  const candidate = payload as { selectedContractTemplateId?: unknown }
  if (typeof candidate.selectedContractTemplateId !== 'string') {
    return undefined
  }

  const trimmed = candidate.selectedContractTemplateId.trim()
  return trimmed || undefined
}

function extractPaymentScheduleAudit(payload: ProposalRow['payment_schedule']): ProposalPaymentScheduleAudit | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  const candidate = payload as { scheduleAudit?: unknown }
  if (!candidate.scheduleAudit || typeof candidate.scheduleAudit !== 'object' || Array.isArray(candidate.scheduleAudit)) {
    return undefined
  }

  const event = candidate.scheduleAudit as Partial<ProposalPaymentScheduleAudit>
  return normalizePaymentScheduleAudit(event)
}

function normalizePaymentScheduleAudit(event: Partial<ProposalPaymentScheduleAudit>): ProposalPaymentScheduleAudit | undefined {
  if (event.action !== 'applied_explicit_schedule' && event.action !== 'cleared_explicit_schedule') {
    return undefined
  }

  if (typeof event.at !== 'string' || !event.at.trim()) {
    return undefined
  }

  return {
    action: event.action,
    at: event.at.trim(),
    ...(typeof event.scheduleId === 'string' && event.scheduleId.trim() ? { scheduleId: event.scheduleId.trim() } : {}),
    ...(typeof event.performedBy === 'string' && event.performedBy.trim() ? { performedBy: event.performedBy.trim() } : {}),
  }
}

function extractPaymentScheduleAuditHistory(payload: ProposalRow['payment_schedule']): ProposalPaymentScheduleAudit[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return []
  }

  const candidate = payload as { scheduleAuditHistory?: unknown }
  if (Array.isArray(candidate.scheduleAuditHistory)) {
    return candidate.scheduleAuditHistory
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined
        return normalizePaymentScheduleAudit(entry as Partial<ProposalPaymentScheduleAudit>)
      })
      .filter((entry): entry is ProposalPaymentScheduleAudit => Boolean(entry))
      .slice(0, 5)
  }

  const latest = extractPaymentScheduleAudit(payload)
  return latest ? [latest] : []
}

function mergePaymentScheduleWithMarketSnapshot(
  payload: ProposalRow['payment_schedule'] | null | undefined,
  marketSnapshot?: ProposalMarketSnapshot,
  recipients?: ProposalRecipient[],
  selectedPaymentScheduleId?: string | null,
  selectedContractTemplateId?: string | null,
  paymentScheduleAuditEvent?: ProposalPaymentScheduleAudit,
  explicitPaymentSchedule?: Array<{ label: string; amount: number; dueDate: string }> | null,
): Database['public']['Tables']['proposals']['Update']['payment_schedule'] {
  if (
    !marketSnapshot
    && !recipients
    && typeof selectedPaymentScheduleId === 'undefined'
    && typeof selectedContractTemplateId === 'undefined'
    && typeof paymentScheduleAuditEvent === 'undefined'
    && typeof explicitPaymentSchedule === 'undefined'
  ) {
    return payload ?? []
  }

  const schedule = Array.isArray(explicitPaymentSchedule)
    ? explicitPaymentSchedule
      .map((entry, index) => ({
        label: (entry.label || '').trim() || `Payment ${index + 1}`,
        amount: Number(entry.amount ?? 0),
        dueDate: (entry.dueDate || '').slice(0, 10),
      }))
      .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0 && Boolean(entry.dueDate))
    : extractScheduleEntries(payload as ProposalRow['payment_schedule'])
  const baseEnvelope = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, Database['public']['Tables']['proposals']['Update']['payment_schedule']>
    : {}

  const snapshotJson = marketSnapshot
    ? {
        clientType: marketSnapshot.clientType,
        language: marketSnapshot.language,
        catalogKey: marketSnapshot.catalogKey,
        currency: marketSnapshot.currency,
        snapshottedAt: marketSnapshot.snapshottedAt,
      }
    : undefined

  const recipientsJson = sanitizeProposalRecipients(recipients ?? extractProposalRecipients(payload as ProposalRow['payment_schedule']))
  const existingHistory = extractPaymentScheduleAuditHistory(payload as ProposalRow['payment_schedule'])
  const normalizedAuditEvent = paymentScheduleAuditEvent ? normalizePaymentScheduleAudit(paymentScheduleAuditEvent) : undefined
  const nextHistory = normalizedAuditEvent
    ? [normalizedAuditEvent, ...existingHistory].slice(0, 5)
    : existingHistory
  const latestAuditEvent = nextHistory[0]

  return {
    ...baseEnvelope,
    schedule,
    ...(marketSnapshot ? { marketSnapshot: snapshotJson } : {}),
    recipients: recipientsJson,
    ...(typeof selectedPaymentScheduleId === 'string' && selectedPaymentScheduleId.trim()
      ? { selectedPaymentScheduleId: selectedPaymentScheduleId.trim() }
      : {}),
    ...(typeof selectedContractTemplateId === 'string' && selectedContractTemplateId.trim()
      ? { selectedContractTemplateId: selectedContractTemplateId.trim() }
      : {}),
    ...(latestAuditEvent
      ? {
          scheduleAudit: {
            action: latestAuditEvent.action,
            at: latestAuditEvent.at,
            ...(latestAuditEvent.scheduleId ? { scheduleId: latestAuditEvent.scheduleId } : {}),
            ...(latestAuditEvent.performedBy ? { performedBy: latestAuditEvent.performedBy } : {}),
          },
        }
      : {}),
    ...(nextHistory.length
      ? {
          scheduleAuditHistory: nextHistory.map((entry) => ({
            action: entry.action,
            at: entry.at,
            ...(entry.scheduleId ? { scheduleId: entry.scheduleId } : {}),
            ...(entry.performedBy ? { performedBy: entry.performedBy } : {}),
          })),
        }
      : {}),
  }
}

function sanitizeProposalRecipients(rawRecipients: unknown[]): ProposalRecipient[] {
  const recipients: ProposalRecipient[] = []
  const seenEmails = new Set<string>()

  for (const rawRecipient of rawRecipients) {
    if (!rawRecipient || typeof rawRecipient !== 'object' || Array.isArray(rawRecipient)) continue

    const candidate = rawRecipient as Partial<ProposalRecipient>
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
    const email = typeof candidate.email === 'string' ? candidate.email.trim() : ''
    const role = typeof candidate.role === 'string' ? candidate.role.trim() : ''

    if (!name || !email) continue

    const emailKey = email.toLowerCase()
    if (seenEmails.has(emailKey)) continue

    seenEmails.add(emailKey)
    recipients.push({
      name,
      email,
      role: role || 'Contact',
      selected: Boolean(candidate.selected),
      isCustom: Boolean(candidate.isCustom),
    })
  }

  return recipients
}

function isProposalMarketSnapshot(value: Partial<ProposalMarketSnapshot>): value is ProposalMarketSnapshot {
  const clientTypeValid = value.clientType === 'INT' || value.clientType === 'MEX'
  const languageValid = value.language === 'en' || value.language === 'es'
  const catalogValid = value.catalogKey === 'INT_USD_ENG' || value.catalogKey === 'MEX_MXN_ESP'
  const currencyValid = value.currency === 'USD' || value.currency === 'MXN'
  return clientTypeValid && languageValid && catalogValid && currencyValid && typeof value.snapshottedAt === 'string'
}

export const TAX_CODES_ORDER = TAX_CODES
export type { TaxToggleMap, FetchProposalOptions }
