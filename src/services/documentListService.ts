import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'
import { resolveFinancialDefaultCurrency } from '@/services/financialCurrencyService'
import { type ProposalPaymentScheduleAudit } from '@/services/proposalService'

interface LeadLite {
  id: string
  clientId: string
  eventDate: string | null
}

interface ClientLite {
  id: string
  name: string
}

interface EventLite {
  id: string
  leadId: string
  startTime: string | null
}

export interface QuoteListRow {
  quoteId: string
  leadId: string
  eventDate: string | null
  clientName: string
  dateSent: string | null
  updatedAt: string | null
  totalAmount: number
  currency: string
  status: string
  hasExplicitPaymentSchedule: boolean
  paymentScheduleAudit?: ProposalPaymentScheduleAudit
}

export interface ContractListRow {
  contractId: string
  eventId: string
  leadId: string
  eventDate: string | null
  clientName: string
  dueDate: string | null
  status: 'signed' | 'draft'
  contractTemplateName: string | null
}

export interface InvoiceListRow {
  invoiceId: string
  invoiceNumber: string
  eventId: string
  leadId: string
  eventDate: string | null
  clientName: string
  totalAmount: number
  currency: string
  dueDate: string | null
  status: string
}

export async function archiveQuote(quoteId: string) {
  const { error } = await supabaseClient
    .from('proposals')
    .update({
      status: 'rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId)

  if (error) throw error
}

export async function sendQuote(quoteId: string) {
  const { data: existingProposal, error: proposalError } = await supabaseClient
    .from('proposals')
    .select('status, payment_schedule')
    .eq('id', quoteId)
    .maybeSingle()

  if (proposalError) throw proposalError

  if (!existingProposal) {
    throw new Error('Quote not found')
  }

  const nextStatus = existingProposal.status === 'accepted' ? 'accepted' : 'sent'
  const nowIso = new Date().toISOString()

  const { error } = await supabaseClient
    .from('proposals')
    .update({
      status: nextStatus,
      payment_schedule: withQuoteSentMetadata(existingProposal.payment_schedule, nowIso),
      updated_at: nowIso,
    })
    .eq('id', quoteId)

  if (error) throw error
}

export async function deleteContract(contractId: string) {
  const { data: existing, error: fetchError } = await supabaseClient
    .from('contracts')
    .select('variables')
    .eq('id', contractId)
    .maybeSingle()

  if (fetchError) throw fetchError

  const existingVariables = (existing?.variables && typeof existing.variables === 'object')
    ? (existing.variables as Record<string, unknown>)
    : {}

  const { error } = await supabaseClient
    .from('contracts')
    .update({
      variables: {
        ...existingVariables,
        _lifecycleStatus: 'archived',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId)

  if (error) throw error
}

export async function voidInvoice(invoiceId: string) {
  const { error } = await supabaseClient
    .from('invoices')
    .update({
      status: 'cancelled',
      amount_due: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)

  if (error) throw error
}

export async function fetchQuoteList(brandSlug: BrandSlug): Promise<QuoteListRow[]> {
  const brandId = await getBrandUuidFromSlug(brandSlug)
  const defaultCurrency = await resolveFinancialDefaultCurrency(brandId)

  const { data: proposals, error } = await supabaseClient
    .from('proposals')
    .select('id, lead_id, status, total_amount, currency, updated_at, payment_schedule')
    .eq('brand_id', brandId)
    .order('updated_at', { ascending: false })

  if (error) throw error

  const rows = proposals ?? []
  if (!rows.length) return []

  const leadMap = await fetchLeadsMap(rows.map((row) => row.lead_id))
  const clientMap = await fetchClientsMap(Array.from(leadMap.values()).map((lead) => lead.clientId))

  return rows.map((row) => {
    const lead = leadMap.get(row.lead_id)
    const client = lead ? clientMap.get(lead.clientId) : null

    return {
      quoteId: row.id,
      leadId: row.lead_id,
      eventDate: lead?.eventDate ?? null,
      clientName: client?.name ?? 'Unknown client',
      dateSent: getQuoteSentAt(row.payment_schedule) ?? (row.status === 'sent' || row.status === 'accepted' ? row.updated_at : null),
      updatedAt: row.updated_at,
      totalAmount: Number(row.total_amount ?? 0),
      currency: row.currency ?? defaultCurrency,
      status: row.status,
      hasExplicitPaymentSchedule: hasExplicitPaymentSchedule(row.payment_schedule),
      paymentScheduleAudit: extractPaymentScheduleAudit(row.payment_schedule),
    }
  })
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

function withQuoteSentMetadata(
  paymentSchedule: unknown,
  sentAt: string,
) {
  if (Array.isArray(paymentSchedule)) {
    return {
      schedule: paymentSchedule,
      quoteSentAt: sentAt,
    }
  }

  if (paymentSchedule && typeof paymentSchedule === 'object') {
    return {
      ...(paymentSchedule as Record<string, unknown>),
      quoteSentAt: sentAt,
    }
  }

  return { quoteSentAt: sentAt }
}

function getQuoteSentAt(paymentSchedule: unknown): string | null {
  if (!paymentSchedule || typeof paymentSchedule !== 'object' || Array.isArray(paymentSchedule)) {
    return null
  }

  const value = (paymentSchedule as Record<string, unknown>).quoteSentAt
  return typeof value === 'string' && value.trim() ? value : null
}

export async function fetchContractList(brandSlug: BrandSlug): Promise<ContractListRow[]> {
  const brandId = await getBrandUuidFromSlug(brandSlug)

  const { data: contracts, error } = await supabaseClient
    .from('contracts')
    .select('id, event_id, signed_at, updated_at, variables')
    .eq('brand_id', brandId)
    .order('updated_at', { ascending: false })

  if (error) throw error

  const rows = (contracts ?? []).filter((row) => !isContractArchived(row.variables))
  if (!rows.length) return []

  const eventMap = await fetchEventsMap(rows.map((row) => row.event_id))
  const leadMap = await fetchLeadsMap(Array.from(eventMap.values()).map((event) => event.leadId))
  const clientMap = await fetchClientsMap(Array.from(leadMap.values()).map((lead) => lead.clientId))
  const dueByEvent = await fetchEarliestInvoiceDueDateByEvent(rows.map((row) => row.event_id))

  return rows.map((row) => {
    const event = eventMap.get(row.event_id)
    const lead = event ? leadMap.get(event.leadId) : undefined
    const client = lead ? clientMap.get(lead.clientId) : undefined

    return {
      contractId: row.id,
      eventId: row.event_id,
      leadId: event?.leadId ?? '',
      eventDate: resolveEventDate(event, lead),
      clientName: client?.name ?? 'Unknown client',
      dueDate: dueByEvent.get(row.event_id) ?? null,
      status: row.signed_at ? 'signed' : 'draft',
      contractTemplateName: extractContractTemplateName(row.variables),
    }
  })
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

export async function fetchInvoiceList(brandSlug: BrandSlug): Promise<InvoiceListRow[]> {
  const brandId = await getBrandUuidFromSlug(brandSlug)
  const defaultCurrency = await resolveFinancialDefaultCurrency(brandId)

  const { data: invoices, error } = await supabaseClient
    .from('invoices')
    .select('id, invoice_number, event_id, status, total_amount, currency, due_date, updated_at')
    .eq('brand_id', brandId)
    .order('updated_at', { ascending: false })

  if (error) throw error

  const rows = invoices ?? []
  if (!rows.length) return []

  const eventMap = await fetchEventsMap(rows.map((row) => row.event_id))
  const leadMap = await fetchLeadsMap(Array.from(eventMap.values()).map((event) => event.leadId))
  const clientMap = await fetchClientsMap(Array.from(leadMap.values()).map((lead) => lead.clientId))

  return rows.map((row) => {
    const event = eventMap.get(row.event_id)
    const lead = event ? leadMap.get(event.leadId) : undefined
    const client = lead ? clientMap.get(lead.clientId) : undefined

    return {
      invoiceId: row.id,
      invoiceNumber: row.invoice_number,
      eventId: row.event_id,
      leadId: event?.leadId ?? '',
      eventDate: resolveEventDate(event, lead),
      clientName: client?.name ?? 'Unknown client',
      totalAmount: Number(row.total_amount ?? 0),
      currency: row.currency ?? defaultCurrency,
      dueDate: row.due_date,
      status: row.status,
    }
  })
}

async function fetchLeadsMap(leadIds: string[]): Promise<Map<string, LeadLite>> {
  const uniqueLeadIds = dedupeIds(leadIds)
  if (!uniqueLeadIds.length) return new Map()

  const { data, error } = await supabaseClient
    .from('leads')
    .select('id, client_id, event_date')
    .in('id', uniqueLeadIds)

  if (error) throw error

  return new Map(
    (data ?? []).map((row) => [
      row.id,
      {
        id: row.id,
        clientId: row.client_id,
        eventDate: row.event_date,
      },
    ]),
  )
}

async function fetchClientsMap(clientIds: string[]): Promise<Map<string, ClientLite>> {
  const uniqueClientIds = dedupeIds(clientIds)
  if (!uniqueClientIds.length) return new Map()

  const { data, error } = await supabaseClient
    .from('clients')
    .select('id, name')
    .in('id', uniqueClientIds)

  if (error) throw error

  return new Map((data ?? []).map((row) => [row.id, { id: row.id, name: row.name }]))
}

async function fetchEventsMap(eventIds: string[]): Promise<Map<string, EventLite>> {
  const uniqueEventIds = dedupeIds(eventIds)
  if (!uniqueEventIds.length) return new Map()

  const { data, error } = await supabaseClient
    .from('events')
    .select('id, lead_id, start_time')
    .in('id', uniqueEventIds)

  if (error) throw error

  return new Map(
    (data ?? []).map((row) => [
      row.id,
      {
        id: row.id,
        leadId: row.lead_id,
        startTime: row.start_time,
      },
    ]),
  )
}

async function fetchEarliestInvoiceDueDateByEvent(eventIds: string[]): Promise<Map<string, string>> {
  const uniqueEventIds = dedupeIds(eventIds)
  if (!uniqueEventIds.length) return new Map()

  const { data, error } = await supabaseClient
    .from('invoices')
    .select('event_id, due_date')
    .in('event_id', uniqueEventIds)
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true })

  if (error) throw error

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    if (!row.due_date) continue
    if (!map.has(row.event_id)) {
      map.set(row.event_id, row.due_date)
    }
  }

  return map
}

function resolveEventDate(event: EventLite | undefined, lead: LeadLite | undefined) {
  if (lead?.eventDate) return lead.eventDate
  if (event?.startTime) return event.startTime.slice(0, 10)
  return null
}

function dedupeIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)))
}

function isContractArchived(payload: unknown) {
  if (!payload || typeof payload !== 'object') return false
  const value = payload as { _lifecycleStatus?: string }
  return value._lifecycleStatus === 'archived'
}
