import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLeadBoard } from '@/services/leadService'
import { useBranding } from '@/contexts/BrandingContext'
import { StatCard } from '../components/StatCard'
import { Card } from '@/components/ui/Card'
import {
  CalendarClock,
  CreditCard,
  Signature,
  Camera,
  TrendingUp,
  MapPin,
  Building2,
} from 'lucide-react'
import { StatusPill } from '@/components/ui/StatusPill'
import { prefetchRouteByPath } from '@/routes/routePrefetch'
import { PrefetchDiagnosticsCard } from '../components/PrefetchDiagnosticsCard'

const UPCOMING_EVENTS = [
  {
    id: 'event-1',
    title: 'Camila & Andrés welcome dinner',
    date: '18 Apr 2026',
    brand: 'amo',
    location: 'San Miguel de Allende',
    type: 'photo',
  },
  {
    id: 'event-2',
    title: 'SaludMX Conference Livestream',
    date: '02 Feb 2026',
    brand: 'csp',
    location: 'CDMX World Trade Center',
    type: 'video',
  },
]

export function AdminDashboardPage() {
  const { brand } = useBranding()

  useEffect(() => {
    prefetchRouteByPath('/leads')
    prefetchRouteByPath('/contracts')
  }, [])

  const { data: leadsByColumn } = useQuery({
    queryKey: ['lead-board', brand.slug],
    queryFn: () => fetchLeadBoard(brand.slug),
  })

  const pipelineStats = useMemo(() => {
    if (!leadsByColumn) return { total: 0, hot: 0 }
    const total = Object.values(leadsByColumn).flat().length
    const hot = (leadsByColumn.proposal?.length ?? 0) + (leadsByColumn.contract?.length ?? 0)
    return { total, hot }
  }, [leadsByColumn])

  return (
    <div className="space-y-4">
      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <StatCard label="Pipeline" value={`${pipelineStats.total} active leads`} delta={`Hot ${pipelineStats.hot}`} icon={<TrendingUp />} />
        <StatCard label="Payments" value="$482k MXN" delta="3 invoices overdue" icon={<CreditCard />} />
        <StatCard label="Contracts" value="12 awaiting signatures" delta="4 due this week" icon={<Signature />} />
        <StatCard label="Production" value="8 crews scheduled" delta="Dual-brand" icon={<Camera />} />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Card title="Upcoming productions" className="p-4 lg:col-span-2">
          <ul className="space-y-3">
            {UPCOMING_EVENTS.map((event) => (
              <li key={event.id} className="flex items-center justify-between rounded-2xl border border-border/30 px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-white">{event.title}</p>
                  <p className="text-xs text-brand-muted">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={14} />
                      {event.date}
                    </span>
                    <span className="ml-4 inline-flex items-center gap-1">
                      <MapPin size={14} />
                      {event.location}
                    </span>
                  </p>
                </div>
                <StatusPill label={event.brand === 'amo' ? 'AMO' : 'CSP'} tone={event.brand === 'amo' ? 'brand' : 'success'} />
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Quick context" className="p-4">
          <div className="space-y-3 text-sm text-brand-muted">
            <p className="flex items-start gap-2">
              <Building2 size={16} className="text-brand-primary" />
              AMO inquiries spiked 22% week over week after the bridal campaign launch.
            </p>
            <p className="flex items-start gap-2">
              <Building2 size={16} className="text-brand-primary" />
              CSP corporate bookings trending toward Q2 conventions block; ensure Wise + Stripe treasury ready.
            </p>
            <p className="flex items-start gap-2">
              <Building2 size={16} className="text-brand-primary" />
              Tax automation: IVA retention toggles now available inside the quote builder preview below.
            </p>
          </div>
        </Card>
      </section>

      {import.meta.env.DEV ? <PrefetchDiagnosticsCard /> : null}
    </div>
  )
}
