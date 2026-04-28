import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { useBranding } from '@/contexts/BrandingContext'
import { usePortalContext } from '@/hooks/usePortalContext'
import { formatCurrencyAmount } from '@/lib/currency'
import {
  formatPaymentScheduleAuditActionLabel,
  formatPaymentScheduleAuditTimestamp,
} from '@/lib/paymentScheduleAuditFormatting'
import {
  fetchLatestProposal,
  acceptProposal,
  fetchProposalPayablesPreview,
  fetchLeadProposals,
  type ProposalListItem,
  type ProposalPayablesPreview,
} from '@/services/proposalService'
import { fetchProposalPdfSnapshot } from '@/services/documentPdfService'
import { resolvePdfLogoUrl } from '@/modules/documents/pdf/pdfBranding'
import type { PortalStep } from '@/services/portalService'
import type { LineItem, TaxLine } from '@/types'

type ProposalData = NonNullable<Awaited<ReturnType<typeof fetchLatestProposal>>>

export function PortalProposalPage() {
  const { brand } = useBranding()
  const { data: portal, isLoading: isPortalLoading } = usePortalContext()
  const leadId = portal?.lead?.id
  const step = portal?.steps.find((item) => item.key === 'proposal')
  const queryClient = useQueryClient()
  const [isPdfBusy, setIsPdfBusy] = useState(false)
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)

  const { data: proposals, isLoading: isProposalsLoading } = useQuery({
    queryKey: ['portal-proposals', brand.slug, leadId],
    queryFn: () => fetchLeadProposals(brand.slug, leadId!, { statuses: ['sent', 'accepted'] }),
    enabled: Boolean(leadId),
  })

  useEffect(() => {
    if (!proposals?.length) {
      setSelectedProposalId(null)
      return
    }

    setSelectedProposalId((current) => {
      if (current && proposals.some((proposal) => proposal.id === current)) {
        return current
      }
      return proposals[0].id
    })
  }, [proposals])

  const { data: proposal, isLoading } = useQuery({
    queryKey: ['portal-proposal', brand.slug, leadId, selectedProposalId],
    queryFn: () => fetchLatestProposal(brand.slug, { leadId, proposalId: selectedProposalId ?? undefined }),
    enabled: Boolean(leadId && selectedProposalId),
  })

  const acceptMutation = useMutation({
    mutationFn: () => (proposal ? acceptProposal(proposal.id) : Promise.resolve()),
    onSuccess: async () => {
      toast.success('Proposal accepted. Questionnaire unlocked!')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['portal-proposals', brand.slug, leadId] }),
        queryClient.invalidateQueries({ queryKey: ['portal-proposal', brand.slug, leadId, selectedProposalId] }),
        queryClient.invalidateQueries({ queryKey: ['portal-context', brand.slug] }),
      ])
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to accept the proposal right now.')
    },
  })

  const { data: payablesPreview } = useQuery({
    queryKey: ['portal-proposal-payables-preview', proposal?.id],
    queryFn: () => (proposal ? fetchProposalPayablesPreview(proposal.id) : Promise.resolve(null)),
    enabled: Boolean(proposal?.id),
  })

  const handleProposalPdf = async (mode: 'view' | 'download') => {
    if (!proposal) {
      toast.error('No proposal available yet')
      return
    }

    try {
      setIsPdfBusy(true)
      const snapshot = await fetchProposalPdfSnapshot(proposal.id)
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
        lines: snapshot.lineItems.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.quantity * line.unitPrice,
        })),
        taxes: snapshot.taxes.map((tax) => ({ label: tax.displayName, amount: tax.amount })),
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
      toast.error('Unable to generate proposal PDF')
    } finally {
      setIsPdfBusy(false)
    }
  }

  if (!leadId && !isPortalLoading) {
    return (
      <Card title="Proposal">
        <p className="text-sm text-brand-muted">We could not find an active lead attached to this portal link.</p>
      </Card>
    )
  }

  if (step?.status === 'locked') {
    return (
      <Card title="Proposal">
        <p className="text-sm text-brand-muted">{step.lockedReason ?? 'Your proposal will appear as soon as we finish tailoring it.'}</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card title="Quotes">
        {isProposalsLoading ? (
          <p className="text-sm text-brand-muted">Loading quote history…</p>
        ) : proposals && proposals.length > 0 ? (
          <div className="space-y-2">
            {proposals.map((item) => (
              <QuoteHistoryRow
                key={item.id}
                item={item}
                selected={item.id === selectedProposalId}
                onSelect={() => setSelectedProposalId(item.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-brand-muted">No quotes published yet. Your producer will add one shortly.</p>
        )}
      </Card>
      <Card
        title="Quote detail"
        actions={<StatusPill label={proposal?.status ?? 'Draft'} tone={proposal?.status === 'accepted' ? 'success' : 'brand'} />}
      >
        {isLoading ? (
          <p className="text-sm text-brand-muted">Loading proposal details…</p>
        ) : !proposal ? (
          <p className="text-sm text-brand-muted">No proposal found yet. Your producer will publish one shortly.</p>
        ) : (
          <ProposalSummary
            proposal={proposal}
            step={step}
            isAccepting={acceptMutation.isPending}
            onAccept={() => acceptMutation.mutate()}
            onViewPdf={() => void handleProposalPdf('view')}
            onDownloadPdf={() => void handleProposalPdf('download')}
            isPdfBusy={isPdfBusy}
          />
        )}
      </Card>
      {proposal && <LineItemsPanel currency={proposal.currency} lineItems={proposal.lineItems} taxes={proposal.taxes} />}
      {proposal && payablesPreview && <PayablesPreviewPanel preview={payablesPreview} />}
    </div>
  )
}

interface ProposalSummaryProps {
  proposal: ProposalData
  step?: PortalStep
  isAccepting: boolean
  isPdfBusy: boolean
  onAccept: () => void
  onViewPdf: () => void
  onDownloadPdf: () => void
}

function QuoteHistoryRow({
  item,
  selected,
  onSelect,
}: {
  item: ProposalListItem
  selected: boolean
  onSelect: () => void
}) {
  const tone = item.status === 'accepted' ? 'success' : item.status === 'rejected' ? 'danger' : item.status === 'sent' ? 'warning' : 'brand'
  const updatedAt = new Date(item.updatedAt).toLocaleDateString('es-MX', { dateStyle: 'medium' })
  const sentAt = item.dateSent ? new Date(item.dateSent).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : 'N/A'
  const validUntil = item.validUntil
    ? new Date(item.validUntil).toLocaleDateString('es-MX', { dateStyle: 'medium' })
    : 'No expiration'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${selected ? 'border-brand-primary/70 bg-brand-primary/10' : 'border-border/30 bg-surface-muted/20 hover:border-border/60'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-brand-muted">Quote {item.id.slice(0, 8)}</p>
          <p className="mt-1 text-sm text-white">{formatCurrencyAmount(item.totalAmount, item.currency)}</p>
          <p className="text-xs text-brand-muted">Sent {sentAt} • Updated {updatedAt}</p>
          <p className="text-xs text-brand-muted">Valid until {validUntil}</p>
          <p className="text-xs text-brand-muted">
            Schedule mode: {item.hasExplicitPaymentSchedule ? 'Explicit rows' : 'Fallback schedule'}
          </p>
          {item.paymentScheduleAudit ? (
            <p className="text-xs text-brand-muted" title={item.paymentScheduleAudit.performedBy || ''}>
              Last schedule action: {formatPaymentScheduleAuditActionLabel(item.paymentScheduleAudit.action)}
              {' '}at {formatPaymentScheduleAuditTimestamp(item.paymentScheduleAudit.at)}
              {item.paymentScheduleAudit.performedBy ? ` by ${item.paymentScheduleAudit.performedBy}` : ''}
            </p>
          ) : null}
        </div>
        <StatusPill label={item.status} tone={tone} />
      </div>
    </button>
  )
}

function ProposalSummary({ proposal, step, isAccepting, onAccept, onViewPdf, onDownloadPdf, isPdfBusy }: ProposalSummaryProps) {
  const totalFormatted = useMemo(() => formatCurrencyAmount(proposal.totalAmount, proposal.currency), [proposal])
  const canAccept = step?.status === 'available' && proposal.status !== 'accepted'
  const sentAtLabel = proposal.dateSent
    ? new Date(proposal.dateSent).toLocaleDateString('es-MX', { dateStyle: 'medium' })
    : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-brand-muted">Total investment</p>
          <p className="mt-2 text-3xl font-semibold text-white">{totalFormatted}</p>
        </div>
        <button
          type="button"
          onClick={onAccept}
          disabled={!canAccept || isAccepting}
          className="rounded-2xl border border-brand-primary/40 bg-brand-primary/20 px-5 py-3 text-xs font-semibold uppercase tracking-[0.4em] text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {proposal.status === 'accepted' ? 'Accepted' : isAccepting ? 'Accepting…' : 'Accept proposal'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onViewPdf}
          disabled={isPdfBusy}
          className="rounded-2xl border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-white disabled:opacity-60"
        >
          View PDF
        </button>
        <button
          type="button"
          onClick={onDownloadPdf}
          disabled={isPdfBusy}
          className="rounded-2xl border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-white disabled:opacity-60"
        >
          Download PDF
        </button>
      </div>
      <p className="text-sm text-brand-muted">
        Review the curated coverage, deliverables, and payment structure. Accepting this proposal will unlock your planning
        questionnaire so we can finalize logistics together.
      </p>
      {sentAtLabel && (
        <p className="text-xs uppercase tracking-[0.2em] text-brand-muted/80">
          Shared from admin on {sentAtLabel}
        </p>
      )}
    </div>
  )
}

interface LineItemsPanelProps {
  currency: string
  lineItems: LineItem[]
  taxes: TaxLine[]
}

function LineItemsPanel({ currency, lineItems, taxes }: LineItemsPanelProps) {
  const subtotal = lineItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
  const taxTotal = taxes.reduce((acc, tax) => acc + tax.amount, 0)
  const grandTotal = subtotal + taxTotal

  return (
    <Card title="Line items" subdued>
      {lineItems.length === 0 ? (
        <p className="text-sm text-brand-muted">This proposal does not have line items yet.</p>
      ) : (
        <div className="space-y-4">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-[0.3em] text-brand-muted">
              <tr>
                <th className="text-left">Description</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item) => (
                <tr key={item.id} className="border-t border-border/20">
                  <td className="py-3 text-white">{item.description}</td>
                  <td className="py-3 text-right text-brand-muted">{item.quantity}</td>
                  <td className="py-3 text-right text-brand-muted">{formatCurrencyAmount(item.unitPrice, currency)}</td>
                  <td className="py-3 text-right text-white">{formatCurrencyAmount(item.quantity * item.unitPrice, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rounded-3xl border border-border/30 bg-surface/40 p-4 text-sm text-brand-muted">
            <p className="flex justify-between"><span>Subtotal</span> <span>{formatCurrencyAmount(subtotal, currency)}</span></p>
            <p className="flex justify-between"><span>Taxes</span> <span>{formatCurrencyAmount(taxTotal, currency)}</span></p>
            <p className="flex justify-between text-white"><span>Total</span> <span>{formatCurrencyAmount(grandTotal, currency)}</span></p>
            {taxes.length > 0 && (
              <ul className="mt-3 text-xs">
                {taxes.map((tax) => (
                  <li key={tax.code}>
                    {tax.displayName}: {formatCurrencyAmount(tax.amount, currency)} {tax.isWithheld ? '(withheld)' : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function PayablesPreviewPanel({ preview }: { preview: ProposalPayablesPreview }) {
  const currency = preview.currency

  return (
    <Card title="Projected A/P Breakdown" subdued>
      <div className="space-y-3">
        <p className="text-sm text-brand-muted">
          These payable entries will be created when the proposal is accepted. Default due date: {preview.dueDate}.
        </p>

        {preview.lines.length ? (
          <div className="overflow-x-auto border border-border/30">
            <table className="min-w-full divide-y divide-border/20 text-sm">
              <thead className="bg-surface-muted/50 text-xs uppercase tracking-[0.2em] text-brand-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Line Item</th>
                  <th className="px-3 py-2 text-left">Matched Template</th>
                  <th className="px-3 py-2 text-right">Revenue</th>
                  <th className="px-3 py-2 text-right">Labor</th>
                  <th className="px-3 py-2 text-right">Admin</th>
                  <th className="px-3 py-2 text-right">Sales</th>
                  <th className="px-3 py-2 text-right">Planner</th>
                  <th className="px-3 py-2 text-right">Payment Fee</th>
                  <th className="px-3 py-2 text-right">Total A/P</th>
                  <th className="px-3 py-2 text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {preview.lines.map((line) => (
                  <tr key={`${line.lineItemLabel}-${line.quantity}`}>
                    <td className="px-3 py-2.5 text-white">{line.lineItemLabel} x{line.quantity}</td>
                    <td className="px-3 py-2.5 text-brand-muted">{line.matchedTemplateName ?? 'No match'}</td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">{formatCurrencyAmount(line.revenue, currency)}</td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">{formatCurrencyAmount(line.labor, currency)}</td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">{formatCurrencyAmount(line.admin, currency)}</td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">{formatCurrencyAmount(line.sales, currency)}</td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">{formatCurrencyAmount(line.planner, currency)}</td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">{formatCurrencyAmount(line.paymentFee, currency)}</td>
                    <td className="px-3 py-2.5 text-right text-white">{formatCurrencyAmount(line.total, currency)}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-200">{formatCurrencyAmount(line.profit, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-muted">No mapped package costs found for this proposal yet.</p>
        )}

        <div className="rounded-2xl border border-border/20 bg-surface/40 p-3 text-sm text-brand-muted">
          <p className="flex justify-between"><span>Revenue</span><span>{formatCurrencyAmount(preview.totals.revenue, currency)}</span></p>
          <p className="flex justify-between"><span>Labor</span><span>{formatCurrencyAmount(preview.totals.labor, currency)}</span></p>
          <p className="flex justify-between"><span>Admin</span><span>{formatCurrencyAmount(preview.totals.admin, currency)}</span></p>
          <p className="flex justify-between"><span>Sales Commission</span><span>{formatCurrencyAmount(preview.totals.sales, currency)}</span></p>
          <p className="flex justify-between"><span>Planner Commission</span><span>{formatCurrencyAmount(preview.totals.planner, currency)}</span></p>
          <p className="flex justify-between"><span>Online Payment Fee</span><span>{formatCurrencyAmount(preview.totals.paymentFee, currency)}</span></p>
          <p className="flex justify-between"><span>Total Commission</span><span>{formatCurrencyAmount(preview.totals.commission, currency)}</span></p>
          <p className="mt-1 flex justify-between text-white"><span>Total A/P</span><span>{formatCurrencyAmount(preview.totals.total, currency)}</span></p>
          <p className="mt-1 flex justify-between text-emerald-200"><span>Residual Profit</span><span>{formatCurrencyAmount(preview.totals.profit, currency)}</span></p>
        </div>

        {preview.unmatchedLineItems.length ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
            <p className="font-semibold uppercase tracking-[0.14em]">Unmatched line items</p>
            <p className="mt-1 text-amber-100/90">
              These items will not auto-create payables until you map them in Settings / Products & Services.
            </p>
            <ul className="mt-2 space-y-1">
              {preview.unmatchedLineItems.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
