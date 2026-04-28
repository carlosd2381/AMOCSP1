import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Eye, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { useBranding } from '@/contexts/BrandingContext'
import { formatCurrencyAmount } from '@/lib/currency'
import {
  formatPaymentScheduleAuditActionLabel,
  formatPaymentScheduleAuditTimestamp,
} from '@/lib/paymentScheduleAuditFormatting'
import { resolvePdfLogoUrl } from '@/modules/documents/pdf/pdfBranding'
import { fetchProposalPdfSnapshot } from '@/services/documentPdfService'
import { archiveQuote, fetchQuoteList, sendQuote } from '@/services/documentListService'
import { trackRouteNavigation } from '@/routes/routePrefetch'

type QuoteFilter = 'all' | 'draft' | 'sent' | 'accepted' | 'archived'

export function QuotesListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { brand } = useBranding()
  const [search, setSearch] = useState('')
  const [busyQuoteId, setBusyQuoteId] = useState<string | null>(null)
  const [archiveQuoteId, setArchiveQuoteId] = useState<string | null>(null)
  const [archiveStep, setArchiveStep] = useState<1 | 2>(1)
  const [sendingQuoteId, setSendingQuoteId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<QuoteFilter>('all')

  const quotesQuery = useQuery({
    queryKey: ['quotes-list', brand.slug],
    queryFn: () => fetchQuoteList(brand.slug),
  })

  const filtered = useMemo(() => {
    const rows = quotesQuery.data ?? []
    const query = search.trim().toLowerCase()
    const statusFiltered = rows.filter((row) => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'archived') return row.status === 'rejected'
      return row.status === statusFilter
    })

    if (!query) return statusFiltered

    return statusFiltered.filter((row) => {
      const haystack = [
        row.quoteId,
        row.clientName,
        row.eventDate ?? '',
        row.dateSent ?? '',
        row.updatedAt ?? '',
        row.status,
      ].join(' ').toLowerCase()

      return haystack.includes(query)
    })
  }, [quotesQuery.data, search, statusFilter])

  const archiveMutation = useMutation({
    mutationFn: archiveQuote,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['quotes-list', brand.slug] })
      toast.success('Quote archived')
      setArchiveQuoteId(null)
      setArchiveStep(1)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to archive quote')
    },
  })

  const sendMutation = useMutation({
    mutationFn: sendQuote,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['quotes-list', brand.slug] })
      toast.success('Quote shared to client portal')
      setSendingQuoteId(null)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to send quote')
      setSendingQuoteId(null)
    },
  })

  const archiveTarget = useMemo(
    () => (quotesQuery.data ?? []).find((row) => row.quoteId === archiveQuoteId) ?? null,
    [archiveQuoteId, quotesQuery.data],
  )

  const handleQuotePdf = async (quoteId: string, mode: 'view' | 'download') => {
    try {
      setBusyQuoteId(quoteId)
      const snapshot = await fetchProposalPdfSnapshot(quoteId)
      const { createProposalPdfBlob, downloadPdfBlob, openPdfBlob } = await import('@/modules/documents/pdf/pdfDocuments')
      const blob = await createProposalPdfBlob({
        proposalId: snapshot.id,
        updatedAt: snapshot.updatedAt,
        validUntil: snapshot.validUntil,
        currency: snapshot.currency,
        clientName: snapshot.clientName,
        clientEmail: snapshot.clientEmail,
        eventTitle: snapshot.eventTitle ?? undefined,
        eventDate: snapshot.eventDate,
        lines: snapshot.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.quantity * item.unitPrice,
        })),
        taxes: snapshot.taxes.map((tax) => ({
          label: `${tax.displayName} (${Math.round(tax.rate * 100)}%)`,
          amount: tax.amount,
        })),
        subtotal: snapshot.subtotal,
        total: snapshot.totalAmount,
        branding: {
          label: brand.label,
          logoUrl: resolvePdfLogoUrl(brand.slug, brand.logo.light),
          companyDetails: snapshot.companyDetails,
        },
      })

      if (mode === 'view') {
        openPdfBlob(blob)
      } else {
        downloadPdfBlob(blob, `quote-${snapshot.id.slice(0, 8)}.pdf`)
      }
    } catch (error) {
      console.error(error)
      toast.error('Unable to generate quote PDF')
    } finally {
      setBusyQuoteId(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title="Quotes"
        className="p-4"
        actions={<span className="text-xs text-brand-muted"># {filtered.length} Total</span>}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input-compact w-full"
              placeholder="Search quotes"
            />
            <button
              type="button"
              className="btn-compact-primary inline-flex items-center gap-1 whitespace-nowrap px-4"
              onClick={() => {
                trackRouteNavigation('/quotes/new')
                navigate('/quotes/new?new=1')
              }}
            >
              <Plus size={13} /> Add Quote
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'all', label: 'All' },
              { key: 'draft', label: 'Draft' },
              { key: 'sent', label: 'Sent' },
              { key: 'accepted', label: 'Accepted' },
              { key: 'archived', label: 'Archived' },
            ] as Array<{ key: QuoteFilter; label: string }>).map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setStatusFilter(filter.key)}
                className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.14em] transition ${statusFilter === filter.key ? 'border-brand-primary/70 bg-brand-primary/20 text-white' : 'border-border/50 text-brand-muted hover:border-border hover:text-white'}`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {quotesQuery.isLoading ? <p className="text-sm text-brand-muted">Loading quotes...</p> : null}

          <div className="overflow-x-auto border border-border/40">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/40 bg-surface-muted/30 text-xs uppercase tracking-[0.14em] text-brand-muted">
                  <th className="px-2 py-2">Qte. ID #</th>
                  <th className="px-2 py-2">Event Date</th>
                  <th className="px-2 py-2">Client Name</th>
                  <th className="px-2 py-2">Date Sent</th>
                  <th className="px-2 py-2">Total</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!filtered.length ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-5 text-sm text-brand-muted">No quotes found.</td>
                  </tr>
                ) : null}
                {filtered.map((quote) => (
                  <tr key={quote.quoteId} className="border-b border-border/20 text-sm text-white last:border-b-0 hover:bg-surface-muted/20">
                    <td className="px-2 py-2 font-medium">{quote.quoteId.slice(0, 8).toUpperCase()}</td>
                    <td className="px-2 py-2 text-brand-muted">{formatDate(quote.eventDate)}</td>
                    <td className="px-2 py-2">{quote.clientName}</td>
                    <td className="px-2 py-2 text-brand-muted">
                      <div>{formatDate(quote.dateSent)}</div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-brand-muted/70">Updated {formatDate(quote.updatedAt)}</div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-brand-muted/70">
                        {quote.hasExplicitPaymentSchedule ? 'Explicit rows' : 'Fallback schedule'}
                      </div>
                      {quote.paymentScheduleAudit ? (
                        <div className="text-[11px] text-brand-muted/80" title={quote.paymentScheduleAudit.performedBy || ''}>
                          {formatPaymentScheduleAuditActionLabel(quote.paymentScheduleAudit.action)} at {formatPaymentScheduleAuditTimestamp(quote.paymentScheduleAudit.at)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">{formatCurrencyAmount(quote.totalAmount, quote.currency)}</td>
                    <td className="px-2 py-2"><StatusPill label={quote.status} tone={resolveProposalTone(quote.status)} /></td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSendingQuoteId(quote.quoteId)
                            sendMutation.mutate(quote.quoteId)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/40 text-emerald-300 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`${quote.status === 'sent' || quote.status === 'accepted' ? 'Re-share' : 'Send'} quote ${quote.quoteId.slice(0, 8)}`}
                          title={quote.status === 'sent' || quote.status === 'accepted' ? 'Re-share to portal' : 'Send to portal'}
                          disabled={sendMutation.isPending || archiveMutation.isPending || Boolean(busyQuoteId)}
                        >
                          <Send size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleQuotePdf(quote.quoteId, 'view')}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          aria-label={`View quote ${quote.quoteId.slice(0, 8)}`}
                          title="View"
                          disabled={Boolean(busyQuoteId)}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            trackRouteNavigation('/quotes/new')
                            navigate(`/quotes/new?proposalId=${encodeURIComponent(quote.quoteId)}&leadId=${encodeURIComponent(quote.leadId)}`)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          aria-label={`Edit quote ${quote.quoteId.slice(0, 8)}`}
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleQuotePdf(quote.quoteId, 'download')}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          aria-label={`Download quote ${quote.quoteId.slice(0, 8)}`}
                          title="Download"
                          disabled={Boolean(busyQuoteId)}
                        >
                          <Download size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setArchiveQuoteId(quote.quoteId)
                            setArchiveStep(1)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/40 text-rose-300 transition hover:border-rose-400 hover:text-rose-200"
                          aria-label={`Archive quote ${quote.quoteId.slice(0, 8)}`}
                          title="Archive"
                          disabled={sendMutation.isPending || sendingQuoteId === quote.quoteId}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {archiveQuoteId && archiveTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl border border-border/60 bg-surface p-4 shadow-card">
            {archiveStep === 1 ? (
              <>
                <h3 className="text-lg font-semibold text-white">Archive Quote</h3>
                <p className="mt-2 text-sm text-brand-muted">
                  You are about to archive quote <span className="text-white">{archiveTarget.quoteId.slice(0, 8).toUpperCase()}</span>.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setArchiveQuoteId(null)
                      setArchiveStep(1)
                    }}
                    className="btn-compact-secondary"
                  >
                    Cancel
                  </button>
                  <button type="button" onClick={() => setArchiveStep(2)} className="btn-compact-primary">Continue</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-white">Final Confirmation</h3>
                <p className="mt-2 text-sm text-brand-muted">
                  Archiving marks this quote as rejected while preserving historical records.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setArchiveStep(1)}
                    className="btn-compact-secondary"
                    disabled={archiveMutation.isPending}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={archiveMutation.isPending}
                    onClick={() => archiveMutation.mutate(archiveQuoteId)}
                    className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/20 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-rose-100 hover:bg-rose-500/30 disabled:opacity-60"
                  >
                    {archiveMutation.isPending ? 'Archiving...' : 'Archive Quote'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

function resolveProposalTone(status: string) {
  switch (status) {
    case 'accepted':
      return 'success' as const
    case 'sent':
      return 'warning' as const
    case 'rejected':
      return 'danger' as const
    default:
      return 'brand' as const
  }
}
