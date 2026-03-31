import { Link, Outlet } from 'react-router-dom'
import { ArrowUpRight, CheckCircle2, Loader2, Lock } from 'lucide-react'
import clsx from 'clsx'
import { useBranding } from '@/contexts/BrandingContext'
import { usePortalContext } from '@/hooks/usePortalContext'
import type { PortalStepStatus } from '@/services/portalService'

export function ClientPortalLayout() {
  const { brand } = useBranding()

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface to-surface-muted text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
        <header className="rounded-4xl border border-border/40 bg-surface/60 p-8 text-center">
          <p className="text-xs uppercase tracking-[0.45em] text-brand-muted">Client portal</p>
          <h1 className="mt-1 text-4xl font-semibold text-white">
            {brand.slug === 'amo' ? 'Welcome to AMO' : 'Welcome to CSP'} client lounge
          </h1>
          <p className="mt-3 text-sm text-brand-muted">
            Contracts, invoices, galleries, and questionnaires unified for your upcoming experience.
          </p>
        </header>
        <PortalStepsStrip />
        <main className="space-y-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function PortalStepsStrip() {
  const { data, isLoading } = usePortalContext()

  if (isLoading) {
    return (
      <div className="rounded-4xl border border-border/30 bg-surface-muted/30 p-6 text-sm text-brand-muted">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Aligning your booking steps…
        </div>
      </div>
    )
  }

  if (!data?.steps.length) return null

  return (
    <nav className="rounded-4xl border border-border/40 bg-surface/40 p-4">
      <ol className="grid gap-3 md:grid-cols-5">
        {data.steps.map((step, index) => {
          const disabled = step.status === 'locked'
          const content = (
            <div className="flex h-full flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.35em] text-brand-muted">Step {String(index + 1).padStart(2, '0')}</p>
                  <p className="text-base font-semibold text-white">{step.title}</p>
                </div>
                <StepStatusBadge status={step.status} />
              </div>
              <p className="text-sm text-brand-muted">
                {step.status === 'locked' && step.lockedReason ? step.lockedReason : step.description}
              </p>
            </div>
          )

          return (
            <li key={step.key}>
              {disabled ? (
                <div className="rounded-3xl border border-border/30 bg-surface-muted/20 p-4 opacity-70">{content}</div>
              ) : (
                <Link
                  to={step.href}
                  className="block h-full rounded-3xl border border-border/30 bg-gradient-to-b from-surface-muted/40 to-surface/70 p-4 transition hover:-translate-y-0.5 hover:border-brand-primary/60"
                >
                  {content}
                  <span className="mt-3 inline-flex items-center text-xs font-semibold uppercase tracking-[0.35em] text-brand-primary">
                    Go to step <ArrowUpRight className="ml-2 h-4 w-4" />
                  </span>
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function StepStatusBadge({ status }: { status: PortalStepStatus }) {
  const map: Record<PortalStepStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
    completed: { label: 'Completed', className: 'text-emerald-300 border border-emerald-400/40', Icon: CheckCircle2 },
    available: { label: 'Ready', className: 'text-brand-primary border border-brand-primary/40', Icon: ArrowUpRight },
    locked: { label: 'Locked', className: 'text-brand-muted border border-border/50', Icon: Lock },
  }
  const { label, className, Icon } = map[status]

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em]',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  )
}
