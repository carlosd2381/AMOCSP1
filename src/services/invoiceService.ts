import { supabaseClient } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { resolveEventDefaultCurrency } from '@/services/financialCurrencyService'

type InvoiceRow = Database['public']['Tables']['invoices']['Row']

type PaymentEntry = {
  label?: string
  amount?: number
  paid_at?: string
  method?: string
}

export interface InvoiceSummary {
  id: string
  invoiceNumber: string
  status: InvoiceRow['status']
  dueDate: string | null
  issuedAt: string | null
  totalAmount: number
  amountDue: number
  currency: string
  payments: Array<{
    label: string
    amount: number
    paidAt: string | null
    method?: string
  }>
}

export async function fetchInvoicesForEvent(eventId: string): Promise<InvoiceSummary[]> {
  const defaultCurrency = await resolveEventDefaultCurrency(eventId)

  const { data, error } = await supabaseClient
    .from('invoices')
    .select('id, invoice_number, status, due_date, issued_at, total_amount, amount_due, currency, payments')
    .eq('event_id', eventId)
    .order('due_date', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    status: row.status,
    dueDate: row.due_date,
    issuedAt: row.issued_at,
    totalAmount: row.total_amount ?? 0,
    amountDue: row.amount_due ?? 0,
    currency: row.currency ?? defaultCurrency,
    payments: normalizePayments(row.payments),
  }))
}

function normalizePayments(payload: InvoiceRow['payments']): InvoiceSummary['payments'] {
  if (!Array.isArray(payload)) return []
  return (payload as PaymentEntry[]).map((entry, index) => ({
    label: entry.label ?? `Payment ${index + 1}`,
    amount: entry.amount ?? 0,
    paidAt: entry.paid_at ?? null,
    method: entry.method,
  }))
}

