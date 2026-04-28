import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { useBranding } from '@/contexts/BrandingContext'
import { formatCurrencyAmount } from '@/lib/currency'
import { resolvePdfLogoUrl } from '@/modules/documents/pdf/pdfBranding'
import { fetchInvoicePdfSnapshot } from '@/services/documentPdfService'
import { fetchInvoiceList, voidInvoice } from '@/services/documentListService'
import { trackRouteNavigation } from '@/routes/routePrefetch'

export function InvoicesListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { brand } = useBranding()
  const [search, setSearch] = useState('')
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null)
  const [voidInvoiceId, setVoidInvoiceId] = useState<string | null>(null)
  const [voidStep, setVoidStep] = useState<1 | 2>(1)

  const invoicesQuery = useQuery({
    queryKey: ['invoices-list', brand.slug],
    queryFn: () => fetchInvoiceList(brand.slug),
  })

  const filtered = useMemo(() => {
    const rows = invoicesQuery.data ?? []
    const query = search.trim().toLowerCase()
    if (!query) return rows

    return rows.filter((row) => {
      const haystack = [
        row.invoiceNumber,
        row.invoiceId,
        row.clientName,
        row.eventDate ?? '',
        row.dueDate ?? '',
        row.status,
      ].join(' ').toLowerCase()

      return haystack.includes(query)
    })
  }, [invoicesQuery.data, search])

  const voidMutation = useMutation({
    mutationFn: voidInvoice,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoices-list', brand.slug] })
      toast.success('Invoice voided')
      setVoidInvoiceId(null)
      setVoidStep(1)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to void invoice')
    },
  })

  const voidTarget = useMemo(
    () => (invoicesQuery.data ?? []).find((row) => row.invoiceId === voidInvoiceId) ?? null,
    [invoicesQuery.data, voidInvoiceId],
  )

  const handleInvoicePdf = async (invoiceId: string, mode: 'view' | 'download') => {
    try {
      setBusyInvoiceId(invoiceId)
      const snapshot = await fetchInvoicePdfSnapshot(invoiceId)
      const { createInvoicePdfBlob, downloadPdfBlob, openPdfBlob } = await import('@/modules/documents/pdf/pdfDocuments')
      const blob = await createInvoicePdfBlob({
        invoiceNumber: snapshot.invoiceNumber,
        status: snapshot.status,
        issuedAt: snapshot.issuedAt,
        dueDate: snapshot.dueDate,
        currency: snapshot.currency,
        clientName: snapshot.clientName,
        clientEmail: snapshot.clientEmail,
        eventTitle: snapshot.eventTitle ?? undefined,
        lines: snapshot.lines,
        total: snapshot.totalAmount,
        amountDue: snapshot.amountDue,
        branding: {
          label: brand.label,
          logoUrl: resolvePdfLogoUrl(brand.slug, brand.logo.light),
          companyDetails: snapshot.companyDetails,
        },
      })

      if (mode === 'view') {
        openPdfBlob(blob)
      } else {
        downloadPdfBlob(blob, `${snapshot.invoiceNumber}.pdf`)
      }
    } catch (error) {
      console.error(error)
      toast.error('Unable to generate invoice PDF')
    } finally {
      setBusyInvoiceId(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title="Invoices"
        className="p-4"
        actions={<span className="text-xs text-brand-muted"># {filtered.length} Total</span>}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input-compact w-full"
              placeholder="Search invoices"
            />
            <button
              type="button"
              className="btn-compact-primary inline-flex items-center gap-1 whitespace-nowrap px-4"
              onClick={() => {
                trackRouteNavigation('/invoices/new')
                navigate('/invoices/new')
              }}
            >
              <Plus size={13} /> Add Invoice
            </button>
          </div>

          {invoicesQuery.isLoading ? <p className="text-sm text-brand-muted">Loading invoices...</p> : null}

          <div className="overflow-x-auto border border-border/40">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/40 bg-surface-muted/30 text-xs uppercase tracking-[0.14em] text-brand-muted">
                  <th className="px-2 py-2">Inv. ID #</th>
                  <th className="px-2 py-2">Event Date</th>
                  <th className="px-2 py-2">Client Name</th>
                  <th className="px-2 py-2">Total</th>
                  <th className="px-2 py-2">Due Date</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!filtered.length ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-5 text-sm text-brand-muted">No invoices found.</td>
                  </tr>
                ) : null}
                {filtered.map((invoice) => (
                  <tr key={invoice.invoiceId} className="border-b border-border/20 text-sm text-white last:border-b-0 hover:bg-surface-muted/20">
                    <td className="px-2 py-2 font-medium">{invoice.invoiceNumber || invoice.invoiceId.slice(0, 8).toUpperCase()}</td>
                    <td className="px-2 py-2 text-brand-muted">{formatDate(invoice.eventDate)}</td>
                    <td className="px-2 py-2">{invoice.clientName}</td>
                    <td className="px-2 py-2">{formatCurrencyAmount(invoice.totalAmount, invoice.currency)}</td>
                    <td className="px-2 py-2 text-brand-muted">{formatDate(invoice.dueDate)}</td>
                    <td className="px-2 py-2"><StatusPill label={invoice.status} tone={resolveInvoiceTone(invoice.status)} /></td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void handleInvoicePdf(invoice.invoiceId, 'view')}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          title="View"
                          aria-label={`View invoice ${invoice.invoiceNumber}`}
                          disabled={Boolean(busyInvoiceId)}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            trackRouteNavigation('/leads/:leadId')
                            navigate(`/leads/${encodeURIComponent(invoice.leadId)}?tab=financials&invoiceId=${encodeURIComponent(invoice.invoiceId)}`)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          title="Edit"
                          aria-label={`Edit invoice ${invoice.invoiceNumber}`}
                          disabled={!invoice.leadId}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleInvoicePdf(invoice.invoiceId, 'download')}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          title="Download"
                          aria-label={`Download invoice ${invoice.invoiceNumber}`}
                          disabled={Boolean(busyInvoiceId)}
                        >
                          <Download size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVoidInvoiceId(invoice.invoiceId)
                            setVoidStep(1)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/40 text-rose-300 transition hover:border-rose-400 hover:text-rose-200"
                          title="Void"
                          aria-label={`Void invoice ${invoice.invoiceNumber}`}
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

      {voidInvoiceId && voidTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl border border-border/60 bg-surface p-4 shadow-card">
            {voidStep === 1 ? (
              <>
                <h3 className="text-lg font-semibold text-white">Void Invoice</h3>
                <p className="mt-2 text-sm text-brand-muted">
                  You are about to void invoice <span className="text-white">{voidTarget.invoiceNumber}</span>.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setVoidInvoiceId(null)
                      setVoidStep(1)
                    }}
                    className="btn-compact-secondary"
                  >
                    Cancel
                  </button>
                  <button type="button" onClick={() => setVoidStep(2)} className="btn-compact-primary">Continue</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-white">Final Confirmation</h3>
                <p className="mt-2 text-sm text-brand-muted">
                  Voiding keeps this invoice for audit history and marks its status as cancelled.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setVoidStep(1)}
                    className="btn-compact-secondary"
                    disabled={voidMutation.isPending}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={voidMutation.isPending}
                    onClick={() => voidMutation.mutate(voidInvoiceId)}
                    className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/20 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-rose-100 hover:bg-rose-500/30 disabled:opacity-60"
                  >
                    {voidMutation.isPending ? 'Voiding...' : 'Void Invoice'}
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

function resolveInvoiceTone(status: string) {
  if (status === 'paid') return 'success' as const
  if (status === 'overdue') return 'danger' as const
  if (status === 'partially_paid') return 'warning' as const
  return 'brand' as const
}
