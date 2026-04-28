import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'
import { fetchContractTemplateSettingsByBrandId, type ContractTemplateDefinition } from '@/services/contractTemplateSettingsService'
import { fetchCompanyDetailsByBrandId } from '@/services/companyDetailsService'
import { formatEventDate, formatMoneyValue } from '@/services/templateTokenRenderingService'

export interface LeadEventOption {
  id: string
  title: string
  startTime: string | null
}

export interface LeadContractItem {
  id: string
  eventId: string
  eventTitle: string
  signedAt: string | null
  updatedAt: string
  contractTemplateName: string | null
}

function extractContractTemplateName(variables: unknown): string | null {
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    return null
  }

  const record = variables as Record<string, unknown>
  const value = record.contractTemplateName
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed || null
}

export interface LeadQuestionnaireItem {
  id: string
  eventId: string
  eventTitle: string
  status: 'draft' | 'submitted'
  submittedAt: string | null
  updatedAt: string
}

interface LeadEventsSnapshot {
  events: LeadEventOption[]
  eventMap: Map<string, LeadEventOption>
}

async function fetchLeadEvents(leadId: string): Promise<LeadEventsSnapshot> {
  const { data, error } = await supabaseClient
    .from('events')
    .select('id, title, start_time')
    .eq('lead_id', leadId)
    .order('start_time', { ascending: true })

  if (error) throw error

  const events = (data ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    startTime: event.start_time,
  }))

  return {
    events,
    eventMap: new Map(events.map((event) => [event.id, event])),
  }
}

export async function fetchLeadContracts(leadId: string): Promise<{ events: LeadEventOption[]; contracts: LeadContractItem[] }> {
  const { events, eventMap } = await fetchLeadEvents(leadId)
  const eventIds = events.map((event) => event.id)

  if (!eventIds.length) {
    return { events, contracts: [] }
  }

  const { data, error } = await supabaseClient
    .from('contracts')
    .select('id, event_id, signed_at, updated_at, variables')
    .in('event_id', eventIds)
    .order('updated_at', { ascending: false })

  if (error) throw error

  const contracts: LeadContractItem[] = (data ?? []).map((contract) => ({
    id: contract.id,
    eventId: contract.event_id,
    eventTitle: eventMap.get(contract.event_id)?.title ?? 'Untitled event',
    signedAt: contract.signed_at,
    updatedAt: contract.updated_at,
    contractTemplateName: extractContractTemplateName(contract.variables),
  }))

  return { events, contracts }
}

interface CreateContractInput {
  eventId: string
  brandId?: string
  brandSlug?: BrandSlug
}

interface ResolvedContractTemplate {
  selectedTemplateId?: string
  template: ContractTemplateDefinition | null
  leadId?: string
  proposal?: {
    lineItems: Array<{ description?: string; quantity?: number; unitPrice?: number }>
    totalAmount: number
    currency: string
    paymentSchedule: unknown
  }
}

function extractSelectedContractTemplateId(payload: unknown): string | undefined {
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

async function resolveContractTemplateForEvent(eventId: string, brandId: string): Promise<ResolvedContractTemplate> {
  const { data: eventRow, error: eventError } = await supabaseClient
    .from('events')
    .select('lead_id')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) throw eventError

  const leadId = eventRow?.lead_id
  const proposalSnapshot = leadId
    ? await (async () => {
      const { data: proposalRow, error: proposalError } = await supabaseClient
        .from('proposals')
        .select('payment_schedule, line_items, total_amount, currency')
        .eq('brand_id', brandId)
        .eq('lead_id', leadId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (proposalError) throw proposalError
      return proposalRow
    })()
    : null

  const selectedTemplateId = extractSelectedContractTemplateId(proposalSnapshot?.payment_schedule)

  const settings = await fetchContractTemplateSettingsByBrandId(brandId)
  const template = settings.templates.find((entry) => entry.id === selectedTemplateId)
    ?? (settings.applyByDefaultWhenMissing
      ? (settings.templates.find((entry) => entry.isDefault) ?? settings.templates[0] ?? null)
      : null)

  return {
    selectedTemplateId,
    template,
    leadId,
    proposal: proposalSnapshot
      ? {
        lineItems: Array.isArray(proposalSnapshot.line_items)
          ? proposalSnapshot.line_items as Array<{ description?: string; quantity?: number; unitPrice?: number }>
          : [],
        totalAmount: Number(proposalSnapshot.total_amount ?? 0),
        currency: proposalSnapshot.currency === 'USD' ? 'USD' : 'MXN',
        paymentSchedule: proposalSnapshot.payment_schedule,
      }
      : undefined,
  }
}

function summarizeOrderLineItems(lineItems: Array<{ description?: string }>): string {
  const labels = lineItems
    .map((item) => (typeof item.description === 'string' ? item.description.trim() : ''))
    .filter(Boolean)

  if (!labels.length) return ''
  if (labels.length <= 3) return labels.join(', ')
  return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`
}

function summarizePaymentSchedule(payload: unknown, currency: string): string {
  const scheduleEntries = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (Array.isArray((payload as { schedule?: unknown }).schedule)
        ? (payload as { schedule: unknown[] }).schedule
        : [])
      : [])

  if (!scheduleEntries.length) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const selectedId = (payload as { selectedPaymentScheduleId?: unknown }).selectedPaymentScheduleId
      if (typeof selectedId === 'string' && selectedId.trim()) {
        return `Schedule: ${selectedId.trim()}`
      }
    }
    return ''
  }

  const segments = scheduleEntries
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ''
      const row = entry as { label?: unknown; amount?: unknown; dueDate?: unknown; due_date?: unknown }
      const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : 'Payment'
      const amount = Number(row.amount ?? 0)
      const dueDateRaw = typeof row.dueDate === 'string'
        ? row.dueDate
        : (typeof row.due_date === 'string' ? row.due_date : '')
      const dueDate = dueDateRaw ? formatEventDate(dueDateRaw) : ''
      const amountText = Number.isFinite(amount) ? formatMoneyValue(amount, currency) : ''

      if (amountText && dueDate) return `${label} ${amountText} due ${dueDate}`
      if (amountText) return `${label} ${amountText}`
      if (dueDate) return `${label} due ${dueDate}`
      return label
    })
    .filter(Boolean)

  return segments.join(' | ')
}

export async function createContractForEvent(input: CreateContractInput) {
  let brandId = input.brandId
  if (!brandId && input.brandSlug) {
    brandId = await getBrandUuidFromSlug(input.brandSlug)
  }
  if (!brandId) throw new Error('Unable to resolve brand for contract creation')

  const { data: existing, error: existingError } = await supabaseClient
    .from('contracts')
    .select('id')
    .eq('event_id', input.eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing?.id) return existing.id

  const resolvedTemplate = await resolveContractTemplateForEvent(input.eventId, brandId)

  const { data: eventRow, error: eventError } = await supabaseClient
    .from('events')
    .select('title, start_time, location')
    .eq('id', input.eventId)
    .maybeSingle()

  if (eventError) throw eventError

  let clientName = ''
  let brideName = ''
  let brideEmail = ''
  let bridePhone = ''
  let groomName = ''
  let groomEmail = ''
  let groomPhone = ''
  if (resolvedTemplate.leadId) {
    const { data: leadRow, error: leadError } = await supabaseClient
      .from('leads')
      .select('client_id')
      .eq('id', resolvedTemplate.leadId)
      .maybeSingle()
    if (leadError) throw leadError

    const clientId = leadRow?.client_id
    if (clientId) {
      const { data: clientRow, error: clientError } = await supabaseClient
        .from('clients')
        .select('name')
        .eq('id', clientId)
        .maybeSingle()
      if (clientError) throw clientError
      clientName = clientRow?.name ?? ''
    }

    const { data: roleRows, error: roleError } = await supabaseClient
      .from('lead_contacts')
      .select('role, contact_id')
      .eq('lead_id', resolvedTemplate.leadId)
      .in('role', ['bride', 'groom'])

    if (roleError) throw roleError

    const contactIds = (roleRows ?? []).map((row) => row.contact_id)
    if (contactIds.length) {
      const { data: contactRows, error: contactError } = await supabaseClient
        .from('address_book_contacts')
        .select('id, display_name, email, phone')
        .in('id', contactIds)

      if (contactError) throw contactError

      const contactsById = new Map((contactRows ?? []).map((row) => [row.id, row]))
      for (const row of roleRows ?? []) {
        const contact = contactsById.get(row.contact_id)
        if (!contact) continue

        if (row.role === 'bride') {
          brideName = brideName || contact.display_name || ''
          brideEmail = brideEmail || contact.email || ''
          bridePhone = bridePhone || contact.phone || ''
        }

        if (row.role === 'groom') {
          groomName = groomName || contact.display_name || ''
          groomEmail = groomEmail || contact.email || ''
          groomPhone = groomPhone || contact.phone || ''
        }
      }
    }
  }

  const companyDetails = await fetchCompanyDetailsByBrandId(brandId)
  const brandName = companyDetails.displayName || companyDetails.legalBusinessName || 'Studio'
  const eventDate = formatEventDate(eventRow?.start_time ?? '')
  const eventTime = eventRow?.start_time
    ? new Date(eventRow.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : ''
  const eventLocation = (() => {
    const location = eventRow?.location
    if (!location || typeof location !== 'object' || Array.isArray(location)) return ''
    const address = (location as Record<string, unknown>).address
    return typeof address === 'string' ? address : ''
  })()

  const proposal = resolvedTemplate.proposal
  const orderSummary = proposal ? summarizeOrderLineItems(proposal.lineItems) : ''
  const orderTotal = proposal ? formatMoneyValue(proposal.totalAmount, proposal.currency) : ''
  const paymentScheduleSummary = proposal ? summarizePaymentSchedule(proposal.paymentSchedule, proposal.currency) : ''

  const bodyHtml = resolvedTemplate.template?.bodyHtml
    ?? '<h2>Production Agreement</h2><p>Add contract clauses here.</p>'

  const { data, error } = await supabaseClient
    .from('contracts')
    .insert({
      event_id: input.eventId,
      brand_id: brandId,
      body_html: bodyHtml,
      variables: {
        selectedContractTemplateId: resolvedTemplate.selectedTemplateId ?? resolvedTemplate.template?.id ?? null,
        contractTemplateName: resolvedTemplate.template?.name ?? null,
        contractTemplateTitle: resolvedTemplate.template?.title ?? null,
        client_name: clientName || null,
        'bride.name': brideName || null,
        'bride.email': brideEmail || null,
        'bride.phone': bridePhone || null,
        bride_name: brideName || null,
        bride_email: brideEmail || null,
        bride_phone: bridePhone || null,
        'groom.name': groomName || null,
        'groom.email': groomEmail || null,
        'groom.phone': groomPhone || null,
        groom_name: groomName || null,
        groom_email: groomEmail || null,
        groom_phone: groomPhone || null,
        brand: brandName || null,
        event_date: eventDate || null,
        event_location: eventLocation || null,
        event_time: eventTime || null,
        order_summary: orderSummary || null,
        order_total: orderTotal || null,
        payment_schedule_summary: paymentScheduleSummary || null,
      },
    })
    .select('id')
    .single()

  if (error || !data) throw error ?? new Error('Unable to create contract')
  return data.id
}

export async function fetchLeadQuestionnaires(leadId: string): Promise<{ events: LeadEventOption[]; questionnaires: LeadQuestionnaireItem[] }> {
  const { events, eventMap } = await fetchLeadEvents(leadId)
  const eventIds = events.map((event) => event.id)

  if (!eventIds.length) {
    return { events, questionnaires: [] }
  }

  const { data, error } = await supabaseClient
    .from('questionnaires')
    .select('id, event_id, status, submitted_at, updated_at')
    .in('event_id', eventIds)
    .order('updated_at', { ascending: false })

  if (error) throw error

  const questionnaires: LeadQuestionnaireItem[] = (data ?? []).map((item) => ({
    id: item.id,
    eventId: item.event_id,
    eventTitle: eventMap.get(item.event_id)?.title ?? 'Untitled event',
    status: item.status,
    submittedAt: item.submitted_at,
    updatedAt: item.updated_at,
  }))

  return { events, questionnaires }
}

interface CreateQuestionnaireDraftInput {
  eventId: string
  clientEmail: string
  brandId?: string
  brandSlug?: BrandSlug
}

export async function createQuestionnaireDraftForEvent(input: CreateQuestionnaireDraftInput) {
  let brandId = input.brandId
  if (!brandId && input.brandSlug) {
    brandId = await getBrandUuidFromSlug(input.brandSlug)
  }
  if (!brandId) throw new Error('Unable to resolve brand for questionnaire creation')

  const { error } = await supabaseClient
    .from('questionnaires')
    .upsert(
      {
        event_id: input.eventId,
        brand_id: brandId,
        client_email: input.clientEmail,
        answers: {},
        status: 'draft',
        submitted_at: null,
      },
      { onConflict: 'event_id' },
    )

  if (error) throw error
}
