import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { type LeadRecord } from '@/types'
import { fetchLeadQuotesOrders } from '@/services/leadQuotesOrdersService'

interface LeadQuotesOrdersTabProps {
  lead: LeadRecord
  focusInvoiceId?: string | null
}

export function LeadQuotesOrdersTab({ lead, focusInvoiceId }: LeadQuotesOrdersTabProps) {
  const navigate = useNavigate()
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null)

  const snapshotQuery = useQuery({
    queryKey: ['lead-quotes-orders', lead.id],
    queryFn: () => fetchLeadQuotesOrders(lead.id),
  })

  const quotes = snapshotQuery.data?.quotes ?? []
  const orders = useMemo(() => snapshotQuery.data?.orders ?? [], [snapshotQuery.data?.orders])

  useEffect(() => {
    if (!focusInvoiceId || !orders.some((order) => order.invoices.some((invoice) => invoice.id === focusInvoiceId))) return
    const highlightId = window.setTimeout(() => {
      setHighlightedInvoiceId(focusInvoiceId)
    }, 0)
    const target = document.getElementById(`lead-invoice-${focusInvoiceId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const timeout = window.setTimeout(() => {
      setHighlightedInvoiceId((current) => (current === focusInvoiceId ? null : current))
    }, 2400)

    return () => {
      window.clearTimeout(highlightId)
      window.clearTimeout(timeout)
    }
  }, [focusInvoiceId, orders])

  return (
    <div className="space-y-4">
      <Card
        className="p-4"
        title="Quotes"
        actions={
          <button
            type="button"
            onClick={() => navigate(`/quotes?leadId=${lead.id}`)}
            className="btn-compact-primary"
          >
            Create Quote
          </button>
        }
      >
        {snapshotQuery.isLoading ? <p className="text-sm text-brand-muted">Loading quotes…</p> : null}

        <div className="space-y-3">
          {quotes.map((quote) => (
            <article key={quote.id} className="rounded-2xl border border-border/40 bg-surface-muted/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white">Quote {quote.id.slice(0, 8)}</p>
                  <p className="mt-1 text-xs text-brand-muted">
                    {formatCurrency(quote.totalAmount, quote.currency)} • Updated {formatDate(quote.updatedAt)}
                  </p>
                  <p className="mt-1 text-xs text-brand-muted">Valid until: {quote.validUntil ?? 'No expiration'}</p>
                </div>
                <StatusPill label={quote.status} />
              </div>
            </article>
          ))}
        </div>

        {!snapshotQuery.isLoading && !quotes.length ? (
          <p className="text-sm text-brand-muted">No quotes created for this lead yet.</p>
        ) : null}
      </Card>

      <Card title="Orders" className="p-4">
        {snapshotQuery.isLoading ? <p className="text-sm text-brand-muted">Loading orders…</p> : null}

        <div className="space-y-3">
          {orders.map((order) => (
            <article key={order.proposalId} className="rounded-2xl border border-border/40 bg-surface-muted/40 p-3">
              <p className="text-sm font-medium text-white">Order from Quote {order.proposalId.slice(0, 8)}</p>
              <p className="mt-1 text-xs text-brand-muted">
                Order total: {formatCurrency(order.totalAmount, order.currency)} • Invoices: {order.invoiceCount}
              </p>
              <p className="mt-1 text-xs text-brand-muted">
                Amount due across invoices: {formatCurrency(order.totalAmountDue, order.currency)}
              </p>

              <div className="mt-2 space-y-2">
                {order.invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    id={`lead-invoice-${invoice.id}`}
                    className={[
                      'rounded-xl border bg-surface/60 px-3 py-2 text-xs transition',
                      highlightedInvoiceId === invoice.id ? 'border-brand-primary/70 ring-1 ring-brand-primary/60' : 'border-border/30',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white">{invoice.invoiceNumber}</span>
                      <StatusPill label={invoice.status} />
                    </div>
                    <p className="mt-1 text-brand-muted">Amount due: {formatCurrency(invoice.amountDue, invoice.currency)}</p>
                  </div>
                ))}
                {!order.invoices.length ? <p className="text-xs text-brand-muted">No invoices linked yet.</p> : null}
              </div>
            </article>
          ))}
        </div>

        {!snapshotQuery.isLoading && !orders.length ? (
          <p className="text-sm text-brand-muted">No accepted quotes/orders for this lead yet.</p>
        ) : null}
      </Card>
    </div>
  )
}

function formatCurrency(value: number, currency: string) {
  return value.toLocaleString('es-MX', { style: 'currency', currency })
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  return date.toLocaleDateString()
}
