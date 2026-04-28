import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { type LeadRecord } from '@/types'
import { formatCurrencyAmount, resolveLedgerCurrency } from '@/lib/currency'
import {
  createLeadPayable,
  deleteLeadPayable,
  fetchLeadFinancials,
  updateLeadPayableStatus,
  type LeadPayableItem,
} from '@/services/leadFinancialsService'
import { fetchLatestProposal, fetchProposalPayablesPreview } from '@/services/proposalService'

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
  const [dueDate, setDueDate] = useState(lead.eventDate || '')
  const [paidDateDraftById, setPaidDateDraftById] = useState<Record<string, string>>({})
  const [showAllocationLines, setShowAllocationLines] = useState(false)

  const financialsQuery = useQuery({
    queryKey: ['lead-financials', lead.id],
    queryFn: () => fetchLeadFinancials(lead.id),
  })

  const latestProposalQuery = useQuery({
    queryKey: ['lead-financials-latest-proposal', lead.client.brandSlug, lead.id],
    queryFn: () => fetchLatestProposal(lead.client.brandSlug ?? 'amo', { leadId: lead.id }),
  })

  const payablesPreviewQuery = useQuery({
    queryKey: ['lead-financials-payables-preview', latestProposalQuery.data?.id],
    queryFn: () => (latestProposalQuery.data ? fetchProposalPayablesPreview(latestProposalQuery.data.id) : Promise.resolve(null)),
    enabled: Boolean(latestProposalQuery.data?.id),
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
      updateLeadPayableStatus(payableId, status, paidDateDraftById[payableId] || null),
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
  const ledgerCurrency = resolveLedgerCurrency({
    invoiceCurrency: snapshot?.invoices?.[0]?.currency,
    preferredCurrency: lead.client.marketProfile?.preferredCurrency,
    fallback: 'MXN',
  })

  const eventDueDate = useMemo(() => lead.eventDate || '', [lead.eventDate])

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

  useEffect(() => {
    setDueDate(eventDueDate)
  }, [eventDueDate])

  useEffect(() => {
    if (!snapshot?.payables?.length) {
      setPaidDateDraftById({})
      return
    }

    setPaidDateDraftById((previous) => {
      const next: Record<string, string> = {}
      snapshot.payables.forEach((payable) => {
        next[payable.id] = previous[payable.id] ?? payable.paidAt ?? ''
      })
      return next
    })
  }, [snapshot?.payables])

  return (
    <div className="space-y-4">
      <Card title="Ledger" className="p-4">
        {financialsQuery.isLoading ? <p className="text-sm text-brand-muted">Loading ledger…</p> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Summary label="Invoiced" value={formatCurrencyAmount(snapshot?.totals.invoiced ?? 0, ledgerCurrency)} />
          <Summary label="Payments Received" value={formatCurrencyAmount(snapshot?.totals.received ?? 0, ledgerCurrency)} />
          <Summary label="Outstanding" value={formatCurrencyAmount(snapshot?.totals.outstanding ?? 0, ledgerCurrency)} />
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
                    Total {formatCurrencyAmount(invoice.totalAmount, invoice.currency)} • Due {formatCurrencyAmount(invoice.amountDue, invoice.currency)}
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
                  <p className="mt-1 text-xs text-brand-muted">{formatCurrencyAmount(payment.amount, payment.currency)}</p>
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
          {payablesPreviewQuery.data ? (
            (() => {
              const preview = payablesPreviewQuery.data
              return (
            <div className="rounded-xl border border-border/40 bg-surface-muted/20 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-muted">Auto-allocation preview</p>
              <p className="mt-1 text-xs text-brand-muted">
                Derived from quote revenue and pricing-input percentages. Due date: {preview.dueDate}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Summary label="Revenue" value={formatCurrencyAmount(preview.totals.revenue, preview.currency)} />
                <Summary label="Labor" value={formatCurrencyAmount(preview.totals.labor, preview.currency)} />
                <Summary label="Admin" value={formatCurrencyAmount(preview.totals.admin, preview.currency)} />
                <Summary label="Sales Comm" value={formatCurrencyAmount(preview.totals.sales, preview.currency)} />
                <Summary label="Planner Comm" value={formatCurrencyAmount(preview.totals.planner, preview.currency)} />
                <Summary label="Payment Fee" value={formatCurrencyAmount(preview.totals.paymentFee, preview.currency)} />
                <Summary label="Total A/P" value={formatCurrencyAmount(preview.totals.total, preview.currency)} />
                <Summary label="Residual Profit" value={formatCurrencyAmount(preview.totals.profit, preview.currency)} />
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  className="btn-compact-secondary"
                  onClick={() => setShowAllocationLines((current) => !current)}
                >
                  {showAllocationLines ? 'Hide line breakdown' : 'Show line breakdown'}
                </button>
              </div>
              {showAllocationLines ? (
                <div className="mt-3 overflow-x-auto border border-border/30">
                  <table className="min-w-full divide-y divide-border/20 text-xs">
                    <thead className="bg-surface-muted/50 uppercase tracking-[0.08em] text-brand-muted">
                      <tr>
                        <th className="px-3 py-2 text-left">Line</th>
                        <th className="px-3 py-2 text-right">Revenue</th>
                        <th className="px-3 py-2 text-right">Labor</th>
                        <th className="px-3 py-2 text-right">Admin</th>
                        <th className="px-3 py-2 text-right">Sales</th>
                        <th className="px-3 py-2 text-right">Planner</th>
                        <th className="px-3 py-2 text-right">Fee</th>
                        <th className="px-3 py-2 text-right">A/P</th>
                        <th className="px-3 py-2 text-right">Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {preview.lines.map((line) => (
                        <tr key={`${line.lineItemLabel}-${line.quantity}`}>
                          <td className="px-3 py-2 text-white">{line.lineItemLabel} x{line.quantity}</td>
                          <td className="px-3 py-2 text-right text-brand-muted">{formatCurrencyAmount(line.revenue, preview.currency)}</td>
                          <td className="px-3 py-2 text-right text-brand-muted">{formatCurrencyAmount(line.labor, preview.currency)}</td>
                          <td className="px-3 py-2 text-right text-brand-muted">{formatCurrencyAmount(line.admin, preview.currency)}</td>
                          <td className="px-3 py-2 text-right text-brand-muted">{formatCurrencyAmount(line.sales, preview.currency)}</td>
                          <td className="px-3 py-2 text-right text-brand-muted">{formatCurrencyAmount(line.planner, preview.currency)}</td>
                          <td className="px-3 py-2 text-right text-brand-muted">{formatCurrencyAmount(line.paymentFee, preview.currency)}</td>
                          <td className="px-3 py-2 text-right text-white">{formatCurrencyAmount(line.total, preview.currency)}</td>
                          <td className="px-3 py-2 text-right text-emerald-200">{formatCurrencyAmount(line.profit, preview.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
              )
            })()
          ) : null}

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
          <p className="text-xs text-brand-muted">Due date defaults to event day. You can set actual paid date later per item.</p>
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
                    <p className="text-xs text-brand-muted capitalize">Source: {payable.source.replace('_', ' ')}</p>
                    <p className="text-xs text-brand-muted">Paid date: {payable.paidAt ?? 'Not paid yet'}</p>
                    <p className="mt-1 text-xs text-brand-muted">{formatCurrencyAmount(payable.amount, payable.currency)}</p>
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
                    <input
                      type="date"
                      className="input-compact"
                      value={paidDateDraftById[payable.id] ?? ''}
                      onChange={(event) =>
                        setPaidDateDraftById((previous) => ({
                          ...previous,
                          [payable.id]: event.target.value,
                        }))
                      }
                      aria-label="Paid date"
                    />
                    <button
                      type="button"
                      onClick={() => statusMutation.mutate({ payableId: payable.id, status: 'paid' })}
                      className="btn-compact-secondary"
                    >
                      Mark Paid
                    </button>
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

