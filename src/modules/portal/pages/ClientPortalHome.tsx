import { Link } from 'react-router-dom'
import { ArrowUpRight, Lock } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { useBranding } from '@/contexts/BrandingContext'
import { useQuery } from '@tanstack/react-query'
import { formatCurrencyAmount } from '@/lib/currency'
import { fetchPortalTimeline, type PortalEventMeta, type PortalStep } from '@/services/portalService'
import { usePortalContext } from '@/hooks/usePortalContext'

interface ClientPortalHomeProps {
  isPreview?: boolean
}

export function ClientPortalHome({ isPreview = false }: ClientPortalHomeProps) {
  const { brand } = useBranding()
  const { data: portalContext, isLoading: isPortalLoading } = usePortalContext()
  const { data, isLoading } = useQuery({
    queryKey: ['portal-timeline', brand.slug],
    queryFn: () => fetchPortalTimeline(brand.slug),
  })
  const timeline = data ?? []
  const steps = portalContext?.steps ?? []
  const bookingMilestones = buildBookingMilestones(steps)
  const nextMilestone = bookingMilestones.find((step) => step.status !== 'completed')
  const eventWindow = describeEventWindow(portalContext?.event ?? null)
  const proposalTotal = portalContext?.proposal
    ? formatCurrencyAmount(portalContext.proposal.totalAmount, portalContext.proposal.currency)
    : null

  return (
    <div className="space-y-6">
      {isPreview && (
        <Card title="Portal preview notice">
          <p className="text-sm text-brand-muted">
            You are viewing the client-facing portal inside the admin shell. Share the branded portal via
            https://app.example.com/portal for a true client experience.
          </p>
        </Card>
      )}
      {portalContext && (
        <Card title="Booking snapshot">
          <div className="grid gap-4 md:grid-cols-3">
            <SnapshotStat
              label="Client"
              value={portalContext.lead?.clientName ?? 'TBD'}
              hint={portalContext.lead?.clientEmail}
            />
            <SnapshotStat
              label="Proposal value"
              value={proposalTotal ?? 'Pending'}
              hint={portalContext.proposal ? portalContext.proposal.status.toUpperCase() : 'Drafting'}
            />
            <SnapshotStat label="Event window" value={eventWindow.title} hint={eventWindow.hint} />
          </div>
        </Card>
      )}
      {portalContext && (
        <Card title="Booking milestones">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-brand-muted">Quote &gt; Questionnaire &gt; Contract &gt; Invoice(s)</p>
            {nextMilestone ? (
              <div className="flex items-center justify-between border border-brand-primary/30 bg-brand-primary/10 px-3 py-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-brand-muted">Next step</p>
                  <p className="text-sm text-white">{nextMilestone.label}</p>
                </div>
                <Link to={nextMilestone.href} className="btn-compact-primary">
                  Open
                </Link>
              </div>
            ) : (
              <div className="border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                Core booking milestones complete.
              </div>
            )}
            <div className="space-y-2">
              {bookingMilestones.map((step) => (
                <div key={step.key} className="flex items-center justify-between border border-border/30 px-3 py-2">
                  <div>
                    <p className="text-sm text-white">{step.label}</p>
                    <p className="text-xs text-brand-muted">{step.statusLabel}</p>
                  </div>
                  <Link to={step.href} className="btn-compact-secondary">
                    Open
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
      <Card title="Booking process">
        {isPortalLoading ? (
          <p className="text-sm text-brand-muted">Loading your personalized steps…</p>
        ) : (
          <PortalStepsList steps={steps} />
        )}
      </Card>
      <Card title={`${brand.label} timeline`}>
        {isLoading && <p className="text-sm text-brand-muted">Updating tasks…</p>}
        <ol className="space-y-4 text-sm text-brand-muted">
          {timeline.map((item) => (
            <li key={item.id} className="rounded-2xl border border-border/40 px-4 py-3">
              <StatusPill label={item.label} tone={item.tone} /> {item.description}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

function PortalStepsList({ steps }: { steps: PortalStep[] }) {
  if (!steps.length) {
    return <p className="text-sm text-brand-muted">Your action items will appear here once a proposal is issued.</p>
  }

  return (
    <ul className="space-y-4">
      {steps.map((step) => {
        const disabled = step.status === 'locked'
        const tone = step.status === 'completed' ? 'success' : step.status === 'locked' ? 'warning' : 'brand'
        const label = step.status === 'completed' ? 'Completed' : step.status === 'locked' ? 'Locked' : 'Ready'

        return (
          <li key={step.key} className="rounded-3xl border border-border/30 bg-surface-muted/40 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-brand-muted">{step.title}</p>
                <p className="mt-2 text-sm text-brand-muted">{step.description}</p>
                {step.status === 'locked' && step.lockedReason && (
                  <p className="mt-2 text-xs text-amber-200/90">{step.lockedReason}</p>
                )}
              </div>
              <StatusPill label={label} tone={tone} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.4em] text-brand-muted">
                {step.meta ?? (step.status === 'completed' ? 'Synced with admin' : 'Client action required')}
              </p>
              {disabled ? (
                <span className="inline-flex items-center gap-2 rounded-2xl border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-brand-muted">
                  {step.ctaLabel}
                  <Lock className="h-4 w-4" />
                </span>
              ) : (
                <Link
                  to={step.href}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition',
                    step.status === 'completed'
                      ? 'border-border/50 hover:border-brand-primary/40'
                      : 'border-brand-primary/50 hover:border-brand-primary/80',
                  )}
                >
                  {step.ctaLabel}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function SnapshotStat({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="rounded-3xl border border-border/30 bg-surface-muted/30 p-4">
      <p className="text-xs uppercase tracking-[0.4em] text-brand-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      {hint && <p className="text-sm text-brand-muted">{hint}</p>}
    </div>
  )
}

function describeEventWindow(event: PortalEventMeta | null) {
  if (!event?.startTime) {
    return { title: 'Pending date', hint: 'We will update this after your questionnaire is submitted.' }
  }

  const date = new Date(event.startTime)
  const formattedDate = date.toLocaleDateString('es-MX', { dateStyle: 'long' })
  const timeRange = event.endTime
    ? `${new Date(event.startTime).toLocaleTimeString('es-MX', { timeStyle: 'short' })} – ${new Date(event.endTime).toLocaleTimeString('es-MX', { timeStyle: 'short' })}`
    : date.toLocaleTimeString('es-MX', { timeStyle: 'short' })

  return {
    title: formattedDate,
    hint: timeRange,
  }
}

function buildBookingMilestones(steps: PortalStep[]) {
  const milestoneMap: Array<{ key: PortalStep['key']; label: string }> = [
    { key: 'proposal', label: 'Quote' },
    { key: 'questionnaire', label: 'Questionnaire' },
    { key: 'contract', label: 'Contract' },
    { key: 'invoices', label: 'Invoice(s)' },
  ]

  return milestoneMap.map((milestone) => {
    const step = steps.find((item) => item.key === milestone.key)
    const status = step?.status ?? 'locked'
    const statusLabel = status === 'completed' ? 'Complete' : status === 'available' ? 'In Progress' : 'Pending'
    return {
      key: milestone.key,
      label: milestone.label,
      href: step?.href ?? '/portal',
      status,
      statusLabel,
    }
  })
}
