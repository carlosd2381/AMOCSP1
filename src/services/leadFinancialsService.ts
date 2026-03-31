import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'

export interface LeadLedgerInvoice {
  id: string
  invoiceNumber: string
  status: 'unpaid' | 'paid' | 'overdue' | 'cancelled' | 'partially_paid'
  totalAmount: number
  amountDue: number
  currency: string
  issuedAt: string | null
}

export interface LeadLedgerPayment {
  id: string
  invoiceId: string
  amount: number
  currency: string
  status: string
  provider: string
  createdAt: string
}

export interface LeadPayableItem {
  id: string
  title: string
  category: string | null
  amount: number
  currency: string
  dueDate: string | null
  status: 'planned' | 'scheduled' | 'paid' | 'cancelled'
  notes: string | null
  createdAt: string
}

export interface LeadFinancialsSnapshot {
  invoices: LeadLedgerInvoice[]
  payments: LeadLedgerPayment[]
  totals: {
    invoiced: number
    received: number
    outstanding: number
  }
  payables: LeadPayableItem[]
}

export async function fetchLeadFinancials(leadId: string): Promise<LeadFinancialsSnapshot> {
  const { data: events, error: eventsError } = await supabaseClient
    .from('events')
    .select('id')
    .eq('lead_id', leadId)

  if (eventsError) {
    throw eventsError
  }

  const eventIds = (events ?? []).map((event) => event.id)

  const [invoicesResult, payablesResult] = await Promise.all([
    eventIds.length
      ? supabaseClient
          .from('invoices')
          .select('id, invoice_number, status, total_amount, amount_due, currency, issued_at')
          .in('event_id', eventIds)
          .order('issued_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabaseClient
      .from('lead_payables')
      .select('id, title, category, amount, currency, due_date, status, notes, created_at')
      .eq('lead_id', leadId)
      .order('due_date', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  if (invoicesResult.error) throw invoicesResult.error
  if (payablesResult.error) throw payablesResult.error

  const invoices: LeadLedgerInvoice[] = (invoicesResult.data ?? []).map((row) => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    status: row.status,
    totalAmount: row.total_amount ?? 0,
    amountDue: row.amount_due ?? 0,
    currency: row.currency ?? 'MXN',
    issuedAt: row.issued_at,
  }))

  const invoiceIds = invoices.map((invoice) => invoice.id)

  const paymentsResult = invoiceIds.length
    ? await supabaseClient
        .from('payments')
        .select('id, invoice_id, amount, currency, status, provider, created_at')
        .in('invoice_id', invoiceIds)
        .order('created_at', { ascending: false })
    : { data: [], error: null }

  if (paymentsResult.error) throw paymentsResult.error

  const payments: LeadLedgerPayment[] = (paymentsResult.data ?? []).map((row) => ({
    id: row.id,
    invoiceId: row.invoice_id,
    amount: row.amount ?? 0,
    currency: row.currency ?? 'MXN',
    status: row.status,
    provider: row.provider,
    createdAt: row.created_at,
  }))

  const payables: LeadPayableItem[] = (payablesResult.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    amount: row.amount ?? 0,
    currency: row.currency ?? 'MXN',
    dueDate: row.due_date,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
  }))

  const totals = {
    invoiced: invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    received: payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0),
    outstanding: invoices.reduce((sum, invoice) => sum + invoice.amountDue, 0),
  }

  return {
    invoices,
    payments,
    totals,
    payables,
  }
}

interface CreateLeadPayableInput {
  leadId: string
  title: string
  amount: number
  category?: string
  dueDate?: string
  notes?: string
  currency?: string
  brandId?: string
  brandSlug?: BrandSlug
}

export async function createLeadPayable(input: CreateLeadPayableInput) {
  const title = input.title.trim()
  if (!title) throw new Error('Payable title is required')
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Payable amount must be greater than zero')

  let brandId = input.brandId
  if (!brandId && input.brandSlug) {
    brandId = await getBrandUuidFromSlug(input.brandSlug)
  }
  if (!brandId) {
    throw new Error('Unable to resolve brand for payable')
  }

  const { error } = await supabaseClient
    .from('lead_payables')
    .insert({
      lead_id: input.leadId,
      brand_id: brandId,
      title,
      amount: input.amount,
      category: input.category?.trim() || null,
      due_date: input.dueDate || null,
      notes: input.notes?.trim() || null,
      currency: input.currency || 'MXN',
      status: 'planned',
    })

  if (error) throw error
}

export async function updateLeadPayableStatus(payableId: string, status: LeadPayableItem['status']) {
  const { error } = await supabaseClient
    .from('lead_payables')
    .update({ status })
    .eq('id', payableId)

  if (error) throw error
}

export async function deleteLeadPayable(payableId: string) {
  const { error } = await supabaseClient
    .from('lead_payables')
    .delete()
    .eq('id', payableId)

  if (error) throw error
}
