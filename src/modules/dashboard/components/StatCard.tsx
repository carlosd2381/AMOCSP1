import { type ReactNode } from 'react'
import { Card } from '@/components/ui/Card'

interface StatCardProps {
  label: string
  value: string
  delta?: string
  icon?: ReactNode
}

export function StatCard({ label, value, delta, icon }: StatCardProps) {
  return (
    <Card subdued className="p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0 pr-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-brand-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold leading-tight text-white xl:text-[2rem]">{value}</p>
          {delta && <p className="mt-1 text-[11px] text-brand-muted">{delta}</p>}
        </div>
        {icon && <div className="rounded-2xl border border-border/40 p-2.5 text-brand-primary">{icon}</div>}
      </div>
    </Card>
  )
}
