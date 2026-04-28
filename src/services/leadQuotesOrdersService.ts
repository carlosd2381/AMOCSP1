import { supabaseClient } from '@/lib/supabase'
import { resolveLeadDefaultCurrency } from '@/services/financialCurrencyService'
import { type ProposalPaymentScheduleAudit } from '@/services/proposalService'

export interface LeadQuoteSummary {
  id: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
  currency: string
  totalAmount: number
  validUntil: string | null
  updatedAt: string
  hasExplicitPaymentSchedule: boolean
  paymentScheduleAudit?: ProposalPaymentScheduleAudit
}

export interface LeadOrderSummary {
  proposalId: string
  currency: string
  totalAmount: number
  updatedAt: string
  invoiceCount: number
  totalAmountDue: number
  invoices: Array<{
    id: string
    invoiceNumber: string
    status: 'unpaid' | 'paid' | 'overdue' | 'cancelled' | 'partially_paid'
    amountDue: number
    currency: string
  }>
}

export interface LeadQuotesOrdersSnapshot {
  quotes: LeadQuoteSummary[]
  orders: LeadOrderSummary[]
}

export async function fetchLeadQuotesOrders(leadId: string): Promise<LeadQuotesOrdersSnapshot> {
  const defaultCurrency = await resolveLeadDefaultCurrency(leadId)

  const { data: proposals, error: proposalsError } = await supabaseClient
    .from('proposals')
    .select('id, status, currency, total_amount, valid_until, updated_at, payment_schedule')
    .eq('lead_id', leadId)
    .order('updated_at', { ascending: false })

  if (proposalsError) {
    throw proposalsError
  }

  const quotes: LeadQuoteSummary[] = (proposals ?? []).map((proposal) => ({
    id: proposal.id,
    status: proposal.status,
    currency: proposal.currency ?? defaultCurrency,
    totalAmount: proposal.total_amount ?? 0,
    validUntil: proposal.valid_until,
    updatedAt: proposal.updated_at,
    hasExplicitPaymentSchedule: hasExplicitPaymentSchedule(proposal.payment_schedule),
    paymentScheduleAudit: extractPaymentScheduleAudit(proposal.payment_schedule),
  }))

  const acceptedProposals = quotes.filter((quote) => quote.status === 'accepted')
  const acceptedIds = acceptedProposals.map((proposal) => proposal.id)

  if (!acceptedIds.length) {
    return {
      quotes,
      orders: [],
    }
  }

  const { data: invoices, error: invoicesError } = await supabaseClient
    .from('invoices')
    .select('id, proposal_id, invoice_number, status, amount_due, currency')
    .in('proposal_id', acceptedIds)
    .order('created_at', { ascending: false })

  if (invoicesError) {
    throw invoicesError
  }

  const invoicesByProposal = new Map<string, LeadOrderSummary['invoices']>()

  ;(invoices ?? []).forEach((invoice) => {
    if (!invoice.proposal_id) return
    const current = invoicesByProposal.get(invoice.proposal_id) ?? []
    current.push({
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      amountDue: invoice.amount_due ?? 0,
      currency: invoice.currency ?? defaultCurrency,
    })
    invoicesByProposal.set(invoice.proposal_id, current)
  })

  const orders: LeadOrderSummary[] = acceptedProposals.map((proposal) => {
    const linkedInvoices = invoicesByProposal.get(proposal.id) ?? []
    return {
      proposalId: proposal.id,
      currency: proposal.currency,
      totalAmount: proposal.totalAmount,
      updatedAt: proposal.updatedAt,
      invoiceCount: linkedInvoices.length,
      totalAmountDue: linkedInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0),
      invoices: linkedInvoices,
    }
  })

  return {
    quotes,
    orders,
  }
}

function hasExplicitPaymentSchedule(payload: unknown): boolean {
  const entries = extractScheduleEntries(payload)
  return entries.some((entry) => {
    const amount = Number(entry.amount ?? 0)
    return Number.isFinite(amount) && amount > 0
  })
}

function extractScheduleEntries(payload: unknown): Array<{ amount?: number }> {
  if (Array.isArray(payload)) {
    return payload as Array<{ amount?: number }>
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const candidate = payload as { schedule?: unknown }
    if (Array.isArray(candidate.schedule)) {
      return candidate.schedule as Array<{ amount?: number }>
    }
  }

  return []
}

function extractPaymentScheduleAudit(payload: unknown): ProposalPaymentScheduleAudit | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  const candidate = payload as { scheduleAudit?: unknown }
  if (!candidate.scheduleAudit || typeof candidate.scheduleAudit !== 'object' || Array.isArray(candidate.scheduleAudit)) {
    return undefined
  }

  const event = candidate.scheduleAudit as Partial<ProposalPaymentScheduleAudit>
  if (event.action !== 'applied_explicit_schedule' && event.action !== 'cleared_explicit_schedule') {
    return undefined
  }

  const at = typeof event.at === 'string' ? event.at.trim() : ''
  if (!at) return undefined

  const scheduleId = typeof event.scheduleId === 'string' ? event.scheduleId.trim() : ''
  const performedBy = typeof event.performedBy === 'string' ? event.performedBy.trim() : ''

  return {
    action: event.action,
    at,
    ...(scheduleId ? { scheduleId } : {}),
    ...(performedBy ? { performedBy } : {}),
  }
}

