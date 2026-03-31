import { type PropsWithChildren, type ReactNode } from 'react'
import clsx from 'clsx'

interface CardProps extends PropsWithChildren {
  title?: ReactNode
  actions?: ReactNode
  className?: string
  subdued?: boolean
}

export function Card({ title, actions, children, className, subdued = false }: CardProps) {
  return (
    <section
      className={clsx(
        'rounded-3xl border border-border/50 p-6 shadow-card transition-all duration-300',
        subdued ? 'bg-surface-muted/70' : 'bg-surface/70',
        'hover:-translate-y-0.5 hover:border-border/80 hover:shadow-lg',
        className,
      )}
    >
      {(title || actions) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {typeof title === 'string' ? (
            <h3 className="text-base font-medium tracking-tight text-brand-muted">{title}</h3>
          ) : (
            title
          )}
          {actions && <div className="flex items-center gap-2 text-sm text-brand-muted">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
