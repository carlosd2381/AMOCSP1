import clsx from 'clsx'

interface StatusPillProps {
  label: string
  tone?: 'brand' | 'success' | 'warning' | 'danger'
}

export function StatusPill({ label, tone = 'brand' }: StatusPillProps) {
  const toneClasses: Record<typeof tone, string> = {
    brand: 'bg-brand-primary/15 text-brand-primary',
    success: 'bg-emerald-400/15 text-emerald-300',
    warning: 'bg-amber-400/15 text-amber-300',
    danger: 'bg-rose-500/15 text-rose-300',
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
        toneClasses[tone],
      )}
    >
      {label}
    </span>
  )
}
