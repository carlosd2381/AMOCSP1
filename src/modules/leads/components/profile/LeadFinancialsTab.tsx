import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { type LeadRecord } from '@/types'
import {
  createLeadPayable,
  deleteLeadPayable,
  fetchLeadFinancials,
  updateLeadPayableStatus,
  type LeadPayableItem,
} from '@/services/leadFinancialsService'

interface LeadFinancialsTabProps {
  lead: LeadRecord
  focusPayableId?: string | null
}

const INPUT_CLASS =
  'input-compact w-full'

export function LeadFinancialsTab({ lead, focusPayableId }: LeadFinancialsTabProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [dueDate, setDueDate] = useState('')

  const financialsQuery = useQuery({
    queryKey: ['lead-financials', lead.id],
    queryFn: () => fetchLeadFinancials(lead.id),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createLeadPayable({
        leadId: lead.id,
        brandId: lead.client.brandId,
        brandSlug: lead.client.brandSlug,
        title,
        amount: Number(amount),
        category,
        dueDate,
      }),
    onSuccess: () => {
      setTitle('')
      setAmount('')
      setCategory('')
      setDueDate('')
      toast.success('Payable added')
      queryClient.invalidateQueries({ queryKey: ['lead-financials', lead.id] })
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to add payable')
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ payableId, status }: { payableId: string; status: LeadPayableItem['status'] }) =>
      updateLeadPayableStatus(payableId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-financials', lead.id] }),
    onError: (error) => {
      console.error(error)
      toast.error('Unable to update payable status')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (payableId: string) => deleteLeadPayable(payableId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-financials', lead.id] }),
    onError: (error) => {
      console.error(error)
      toast.error('Unable to delete payable')
    },
  })

  const snapshot = financialsQuery.data

  const [highlightedPayableId, setHighlightedPayableId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusPayableId || !snapshot?.payables.some((payable) => payable.id === focusPayableId)) return
    const highlightId = window.setTimeout(() => {
      setHighlightedPayableId(focusPayableId)
    }, 0)
    const target = document.getElementById(`lead-payable-${focusPayableId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const timeout = window.setTimeout(() => {
      setHighlightedPayableId((current) => (current === focusPayableId ? null : current))
    }, 2400)

    return () => {
      window.clearTimeout(highlightId)
      window.clearTimeout(timeout)
    }
  }, [focusPayableId, snapshot?.payables])

  return (
    <div className="space-y-4">
      <Card title="Ledger" className="p-4">
        {financialsQuery.isLoading ? <p className="text-sm text-brand-muted">Loading ledger…</p> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Summary label="Invoiced" value={formatMoney(snapshot?.totals.invoiced ?? 0, 'MXN')} />
          <Summary label="Payments Received" value={formatMoney(snapshot?.totals.received ?? 0, 'MXN')} />
          <Summary label="Outstanding" value={formatMoney(snapshot?.totals.outstanding ?? 0, 'MXN')} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-brand-muted">Invoices</p>
            <div className="space-y-2">
              {(snapshot?.invoices ?? []).map((invoice) => (
                <div key={invoice.id} className="rounded-xl border border-border/40 bg-surface-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-white">{invoice.invoiceNumber}</p>
                    <StatusPill label={invoice.status} />
                  </div>
                  <p className="mt-1 text-xs text-brand-muted">
                    Total {formatMoney(invoice.totalAmount, invoice.currency)} • Due {formatMoney(invoice.amountDue, invoice.currency)}
                  </p>
                </div>
              ))}
              {!financialsQuery.isLoading && !(snapshot?.invoices.length ?? 0) ? (
                <p className="text-sm text-brand-muted">No invoices yet for this lead.</p>
              ) : null}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-brand-muted">Payments Received</p>
            <div className="space-y-2">
              {(snapshot?.payments ?? []).map((payment) => (
                <div key={payment.id} className="rounded-xl border border-border/40 bg-surface-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-white">{payment.provider}</p>
                    <StatusPill label={payment.status} />
                  </div>
                  <p className="mt-1 text-xs text-brand-muted">{formatMoney(payment.amount, payment.currency)}</p>
                </div>
              ))}
              {!financialsQuery.isLoading && !(snapshot?.payments.length ?? 0) ? (
                <p className="text-sm text-brand-muted">No payment records yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <Card title="A/P" className="p-4">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className={INPUT_CLASS}
              placeholder="Payable title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              className={INPUT_CLASS}
              placeholder="Amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <input
              className={INPUT_CLASS}
              placeholder="Category (vendor, staff, rental...)"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
            <input
              type="date"
              className={INPUT_CLASS}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !title.trim() || !amount}
            className="btn-compact-primary"
          >
            Add Payable
          </button>

          <div className="space-y-2">
            {(snapshot?.payables ?? []).map((payable) => (
              <div
                key={payable.id}
                id={`lead-payable-${payable.id}`}
                className={[
                  'rounded-xl border bg-surface-muted/40 p-3 transition',
                  highlightedPayableId === payable.id ? 'border-brand-primary/70 ring-1 ring-brand-primary/60' : 'border-border/40',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-white">{payable.title}</p>
                    <p className="text-xs text-brand-muted">
                      {payable.category ?? 'Uncategorized'} • Due {payable.dueDate ?? 'No due date'}
                    </p>
                    <p className="mt-1 text-xs text-brand-muted">{formatMoney(payable.amount, payable.currency)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="select-compact"
                      value={payable.status}
                      onChange={(event) =>
                        statusMutation.mutate({ payableId: payable.id, status: event.target.value as LeadPayableItem['status'] })
                      }
                    >
                      <option value="planned">planned</option>
                      <option value="scheduled">scheduled</option>
                      <option value="paid">paid</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(payable.id)}
                      className="btn-compact-secondary"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {!financialsQuery.isLoading && !(snapshot?.payables.length ?? 0) ? (
              <p className="text-sm text-brand-muted">No planned outgoing payments yet.</p>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-surface-muted/40 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-brand-muted">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  )
}

function formatMoney(value: number, currency: string) {
  return value.toLocaleString('es-MX', { style: 'currency', currency })
}
