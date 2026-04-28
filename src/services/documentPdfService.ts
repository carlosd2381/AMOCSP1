import { supabaseClient } from '@/lib/supabase'
import type { LineItem, TaxLine } from '@/types'
import { fetchCompanyDetailsByBrandId, type CompanyDetails } from '@/services/companyDetailsService'
import { resolveFinancialDefaultCurrency } from '@/services/financialCurrencyService'
import { formatEventDate, normalizeTokenValueMap, resolveTemplateTokens } from '@/services/templateTokenRenderingService'

interface ClientRow {
  id: string
  name: string
  email: string
}

interface LeadRow {
  id: string
  client_id: string
}

interface EventRow {
  id: string
  lead_id: string
  title: string
  start_time: string | null
  location?: unknown
}

export interface ProposalPdfSnapshot {
  id: string
  updatedAt: string
  validUntil: string | null
  currency: string
  subtotal: number
  totalAmount: number
  lineItems: LineItem[]
  taxes: TaxLine[]
  clientName: string
  clientEmail: string
  eventTitle: string | null
  eventDate: string | null
  companyDetails: CompanyDetails
}

export interface InvoicePdfSnapshot {
  id: string
  invoiceNumber: string
  status: string
  issuedAt: string | null
  dueDate: string | null
  currency: string
  totalAmount: number
  amountDue: number
  lines: Array<{ description: string; amount: number }>
  clientName: string
  clientEmail: string
  eventTitle: string | null
  companyDetails: CompanyDetails
}

export interface ContractPdfSnapshot {
  id: string
  status: 'draft' | 'signed'
  updatedAt: string
  signedAt: string | null
  bodyHtml: string
  clientName: string
  clientEmail: string
  eventTitle: string | null
  eventDate: string | null
  companyDetails: CompanyDetails
}

export async function fetchProposalPdfSnapshot(proposalId: string): Promise<ProposalPdfSnapshot> {
  const { data: proposal, error: proposalError } = await supabaseClient
    .from('proposals')
    .select('id, lead_id, brand_id, line_items, taxes, subtotal, total_amount, currency, valid_until, updated_at')
    .eq('id', proposalId)
    .maybeSingle()

  if (proposalError || !proposal) {
    throw proposalError ?? new Error('Proposal not found')
  }

  const lead = await fetchLeadById(proposal.lead_id)
  const client = await fetchClientById(lead.client_id)
  const event = await fetchFirstEventForLead(lead.id)
  const companyDetails = await fetchCompanyDetailsByBrandId(proposal.brand_id)
  const defaultCurrency = await resolveFinancialDefaultCurrency(proposal.brand_id)

  return {
    id: proposal.id,
    updatedAt: proposal.updated_at,
    validUntil: proposal.valid_until,
    currency: proposal.currency ?? defaultCurrency,
    subtotal: proposal.subtotal ?? 0,
    totalAmount: proposal.total_amount ?? 0,
    lineItems: normalizeLineItems(proposal.line_items),
    taxes: normalizeTaxes(proposal.taxes),
    clientName: client.name,
    clientEmail: client.email,
    eventTitle: event?.title ?? null,
    eventDate: event?.start_time ?? null,
    companyDetails,
  }
}

export async function fetchInvoicePdfSnapshot(invoiceId: string): Promise<InvoicePdfSnapshot> {
  const { data: invoice, error: invoiceError } = await supabaseClient
    .from('invoices')
    .select('id, proposal_id, event_id, brand_id, invoice_number, status, issued_at, due_date, line_items, total_amount, amount_due, currency')
    .eq('id', invoiceId)
    .maybeSingle()

  if (invoiceError || !invoice) {
    throw invoiceError ?? new Error('Invoice not found')
  }

  let leadId: string | null = null
  let eventTitle: string | null = null

  if (invoice.event_id) {
    const event = await fetchEventById(invoice.event_id)
    leadId = event?.lead_id ?? null
    eventTitle = event?.title ?? null
  }

  if (!leadId && invoice.proposal_id) {
    const { data: proposal, error: proposalError } = await supabaseClient
      .from('proposals')
      .select('lead_id')
      .eq('id', invoice.proposal_id)
      .maybeSingle()
    if (proposalError) throw proposalError
    leadId = proposal?.lead_id ?? null
  }

  if (!leadId) {
    throw new Error('Unable to resolve lead for invoice')
  }

  const lead = await fetchLeadById(leadId)
  const client = await fetchClientById(lead.client_id)
  const companyDetails = await fetchCompanyDetailsByBrandId(invoice.brand_id)
  const defaultCurrency = await resolveFinancialDefaultCurrency(invoice.brand_id)

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
    issuedAt: invoice.issued_at,
    dueDate: invoice.due_date,
    currency: invoice.currency ?? defaultCurrency,
    totalAmount: invoice.total_amount ?? 0,
    amountDue: invoice.amount_due ?? 0,
    lines: normalizeInvoiceLines(invoice.line_items, invoice.total_amount ?? 0),
    clientName: client.name,
    clientEmail: client.email,
    eventTitle,
    companyDetails,
  }
}

export async function fetchContractPdfSnapshot(contractId: string): Promise<ContractPdfSnapshot> {
  const { data: contract, error: contractError } = await supabaseClient
    .from('contracts')
    .select('id, event_id, brand_id, body_html, signed_at, updated_at, variables')
    .eq('id', contractId)
    .maybeSingle()

  if (contractError || !contract) {
    throw contractError ?? new Error('Contract not found')
  }

  const event = await fetchEventById(contract.event_id)
  const leadId = event?.lead_id
  if (!leadId) {
    throw new Error('Unable to resolve lead for contract')
  }

  const lead = await fetchLeadById(leadId)
  const client = await fetchClientById(lead.client_id)
  const companyDetails = await fetchCompanyDetailsByBrandId(contract.brand_id)
  const fallbackTokens: Record<string, string> = {
    client_name: client.name,
    brand: companyDetails.displayName || companyDetails.legalBusinessName,
    event_date: formatEventDate(event?.start_time),
  }

  if (event?.start_time) {
    fallbackTokens.event_time = new Date(event.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  if (event?.location && typeof event.location === 'object' && !Array.isArray(event.location)) {
    const location = event.location as Record<string, unknown>
    if (typeof location.address === 'string' && location.address.trim()) {
      fallbackTokens.event_location = location.address.trim()
    }
  }

  const variableTokens = normalizeTokenValueMap((contract.variables as Record<string, unknown>) ?? {})

  return {
    id: contract.id,
    status: contract.signed_at ? 'signed' : 'draft',
    updatedAt: contract.updated_at,
    signedAt: contract.signed_at,
    bodyHtml: resolveTemplateTokens(contract.body_html, { ...fallbackTokens, ...variableTokens }),
    clientName: client.name,
    clientEmail: client.email,
    eventTitle: event?.title ?? null,
    eventDate: event?.start_time ?? null,
    companyDetails,
  }
}

async function fetchLeadById(leadId: string): Promise<LeadRow> {
  const { data, error } = await supabaseClient
    .from('leads')
    .select('id, client_id')
    .eq('id', leadId)
    .maybeSingle()

  if (error || !data) {
    throw error ?? new Error('Lead not found')
  }

  return data
}

async function fetchClientById(clientId: string): Promise<ClientRow> {
  const { data, error } = await supabaseClient
    .from('clients')
    .select('id, name, email')
    .eq('id', clientId)
    .maybeSingle()

  if (error || !data) {
    throw error ?? new Error('Client not found')
  }

  return data
}

async function fetchFirstEventForLead(leadId: string): Promise<EventRow | null> {
  const { data, error } = await supabaseClient
    .from('events')
    .select('id, lead_id, title, start_time, location')
    .eq('lead_id', leadId)
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

async function fetchEventById(eventId: string): Promise<EventRow | null> {
  const { data, error } = await supabaseClient
    .from('events')
    .select('id, lead_id, title, start_time, location')
    .eq('id', eventId)
    .maybeSingle()

  if (error) throw error
  return data
}

function normalizeLineItems(payload: unknown): LineItem[] {
  if (!Array.isArray(payload)) return []
  return payload as LineItem[]
}

function normalizeTaxes(payload: unknown): TaxLine[] {
  if (!Array.isArray(payload)) return []
  return payload as TaxLine[]
}

function normalizeInvoiceLines(payload: unknown, fallbackAmount: number): Array<{ description: string; amount: number }> {
  if (!Array.isArray(payload)) {
    return [{ description: 'Invoice Services', amount: fallbackAmount }]
  }

  const rows = (payload as Array<Record<string, unknown>>).map((row) => {
    const quantity = Number(row.quantity ?? 1)
    const unitPrice = Number(row.unitPrice ?? row.unit_price ?? row.amount ?? 0)
    const description = typeof row.description === 'string' ? row.description : 'Line Item'
    const amount = Number.isFinite(quantity * unitPrice) ? quantity * unitPrice : Number(row.amount ?? 0)

    return {
      description,
      amount: Number.isFinite(amount) ? amount : 0,
    }
  })

  return rows.length ? rows : [{ description: 'Invoice Services', amount: fallbackAmount }]
}

