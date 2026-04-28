import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { useBranding } from '@/contexts/BrandingContext'
import { usePortalContext } from '@/hooks/usePortalContext'
import { formatCurrencyAmount } from '@/lib/currency'
import { fetchInvoicePdfSnapshot } from '@/services/documentPdfService'
import { fetchInvoicesForEvent } from '@/services/invoiceService'
import { resolvePdfLogoUrl } from '@/modules/documents/pdf/pdfBranding'

const STATUS_TONE: Record<string, 'brand' | 'success' | 'warning' | 'danger'> = {
  unpaid: 'warning',
  partially_paid: 'warning',
  overdue: 'danger',
  paid: 'success',
  cancelled: 'danger',
}

export function PortalInvoicesPage() {
  const { brand } = useBranding()
  const { data: portal, isLoading: isPortalLoading } = usePortalContext()
  const eventId = portal?.event?.id
  const step = portal?.steps.find((item) => item.key === 'invoices')
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null)

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['portal-invoices', eventId],
    queryFn: () => fetchInvoicesForEvent(eventId!),
    enabled: Boolean(eventId) && step?.status !== 'locked',
  })

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

  if (step?.status === 'locked') {
    return (
      <Card title="Invoices">
        <p className="text-sm text-brand-muted">{step.lockedReason ?? 'Sign the contract to unlock billing.'}</p>
      </Card>
    )
  }

  if (!eventId && !isPortalLoading) {
    return (
      <Card title="Invoices">
        <p className="text-sm text-brand-muted">Invoices will appear once an event is linked to your lead.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Card title="Invoices">
          <p className="text-sm text-brand-muted">Loading invoices…</p>
        </Card>
      ) : invoices && invoices.length > 0 ? (
        invoices.map((invoice) => (
          <InvoiceCard
            key={invoice.id}
            invoice={invoice}
            isBusy={busyInvoiceId === invoice.id}
            onViewPdf={() => void handleInvoicePdf(invoice.id, 'view')}
            onDownloadPdf={() => void handleInvoicePdf(invoice.id, 'download')}
          />
        ))
      ) : (
        <Card title="Invoices">
          <p className="text-sm text-brand-muted">No invoices published yet. Your producer will add them shortly.</p>
        </Card>
      )}
    </div>
  )
}

function InvoiceCard({
  invoice,
  isBusy,
  onViewPdf,
  onDownloadPdf,
}: {
  invoice: Awaited<ReturnType<typeof fetchInvoicesForEvent>> extends Array<infer R> ? R : never
  isBusy: boolean
  onViewPdf: () => void
  onDownloadPdf: () => void
}) {
  const tone = STATUS_TONE[invoice.status] ?? 'brand'
  const dueDate = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString('es-MX', { dateStyle: 'medium' })
    : 'Upon receipt'
  const issued = invoice.issuedAt
    ? new Date(invoice.issuedAt).toLocaleDateString('es-MX', { dateStyle: 'medium' })
    : 'Pending'
  const payments = invoice.payments ?? []
  const balance = useMemo(() => Math.max(invoice.amountDue, 0), [invoice.amountDue])

  return (
    <Card
      title={invoice.invoiceNumber}
      actions={<StatusPill label={invoice.status.replace(/_/g, ' ')} tone={tone} />}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Due date" value={dueDate} />
        <Stat label="Issued" value={issued} />
        <Stat label="Balance" value={formatCurrencyAmount(balance, invoice.currency)} />
      </div>
      {payments.length > 0 && (
        <div className="mt-4 rounded-3xl border border-border/30 bg-surface-muted/30 p-4 text-sm text-brand-muted">
          <p className="text-xs uppercase tracking-[0.35em] text-brand-muted">Payments</p>
          <ul className="mt-2 space-y-2">
            {payments.map((payment, index) => (
              <li key={`${payment.label}-${index}`} className="flex justify-between border-b border-border/20 pb-1 text-white last:border-none last:pb-0">
                <span>{payment.label}</span>
                <span>
                  {formatCurrencyAmount(payment.amount, invoice.currency)} ·{' '}
                  {payment.paidAt ? new Date(payment.paidAt).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : 'Processing'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.4em] text-brand-muted">
          Pay via the same secure link used on the admin side. Need help? Email hola@amo.mx
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onViewPdf}
            disabled={isBusy}
            className="rounded-2xl border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white disabled:opacity-60"
          >
            View PDF
          </button>
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={isBusy}
            className="rounded-2xl border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white disabled:opacity-60"
          >
            Download PDF
          </button>
        </div>
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.4em] text-brand-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  )
}

