import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { useBranding } from '@/contexts/BrandingContext'
import { usePortalContext } from '@/hooks/usePortalContext'
import { fetchLatestProposal, acceptProposal } from '@/services/proposalService'
import type { PortalStep } from '@/services/portalService'
import type { LineItem, TaxLine } from '@/types'

type ProposalData = NonNullable<Awaited<ReturnType<typeof fetchLatestProposal>>>

export function PortalProposalPage() {
  const { brand } = useBranding()
  const { data: portal, isLoading: isPortalLoading } = usePortalContext()
  const leadId = portal?.lead?.id
  const step = portal?.steps.find((item) => item.key === 'proposal')
  const queryClient = useQueryClient()

  const { data: proposal, isLoading } = useQuery({
    queryKey: ['portal-proposal', brand.slug, leadId],
    queryFn: () => fetchLatestProposal(brand.slug, { leadId }),
    enabled: Boolean(leadId),
  })

  const acceptMutation = useMutation({
    mutationFn: () => (proposal ? acceptProposal(proposal.id) : Promise.resolve()),
    onSuccess: async () => {
      toast.success('Proposal accepted. Questionnaire unlocked!')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['portal-proposal', brand.slug, leadId] }),
        queryClient.invalidateQueries({ queryKey: ['portal-context', brand.slug] }),
      ])
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to accept the proposal right now.')
    },
  })

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
      <Card
        title="Quote & proposal"
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
          />
        )}
      </Card>
      {proposal && <LineItemsPanel currency={proposal.currency} lineItems={proposal.lineItems} taxes={proposal.taxes} />}
    </div>
  )
}

interface ProposalSummaryProps {
  proposal: ProposalData
  step?: PortalStep
  isAccepting: boolean
  onAccept: () => void
}

function ProposalSummary({ proposal, step, isAccepting, onAccept }: ProposalSummaryProps) {
  const totalFormatted = useMemo(() => formatMoney(proposal.totalAmount, proposal.currency), [proposal])
  const canAccept = step?.status === 'available' && proposal.status !== 'accepted'

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
      <p className="text-sm text-brand-muted">
        Review the curated coverage, deliverables, and payment structure. Accepting this proposal will unlock your planning
        questionnaire so we can finalize logistics together.
      </p>
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
                  <td className="py-3 text-right text-brand-muted">{formatMoney(item.unitPrice, currency)}</td>
                  <td className="py-3 text-right text-white">{formatMoney(item.quantity * item.unitPrice, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rounded-3xl border border-border/30 bg-surface/40 p-4 text-sm text-brand-muted">
            <p className="flex justify-between"><span>Subtotal</span> <span>{formatMoney(subtotal, currency)}</span></p>
            <p className="flex justify-between"><span>Taxes</span> <span>{formatMoney(taxTotal, currency)}</span></p>
            <p className="flex justify-between text-white"><span>Total</span> <span>{formatMoney(grandTotal, currency)}</span></p>
            {taxes.length > 0 && (
              <ul className="mt-3 text-xs">
                {taxes.map((tax) => (
                  <li key={tax.code}>
                    {tax.displayName}: {formatMoney(tax.amount, currency)} {tax.isWithheld ? '(withheld)' : ''}
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

function formatMoney(value: number, currency: string) {
  return value.toLocaleString('es-MX', {
    style: 'currency',
    currency,
  })
}
