import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { type LeadRecord } from '@/types'
import { fetchLeadActivity } from '@/services/leadActivityService'
import { type LeadProfileTab } from '@/modules/leads/profile/leadProfileTabs'

type DateWindow = 'all' | '7d' | '30d' | '90d'

interface LeadActivityFeedCardProps {
  lead: LeadRecord
  onSelectTab?: (tab: LeadProfileTab, focusTarget?: string) => void
}

export function LeadActivityFeedCard({ lead, onSelectTab }: LeadActivityFeedCardProps) {
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [dateWindow, setDateWindow] = useState<DateWindow>('30d')
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTimestamp(Date.now())
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [])

  const activityQuery = useQuery({
    queryKey: ['lead-activity', lead.id],
    queryFn: () => fetchLeadActivity(lead.id),
  })

  const availableTypes = useMemo(() => {
    const items = activityQuery.data ?? []
    return Array.from(new Set(items.map((item) => item.type)))
  }, [activityQuery.data])

  const filteredItems = useMemo(() => {
    const source = activityQuery.data ?? []
    const threshold = getWindowThreshold(dateWindow, nowTimestamp)

    return source.filter((item) => {
      const matchesType = typeFilter === 'all' || item.type === typeFilter
      if (!matchesType) return false

      if (threshold === null) return true
      const itemTime = new Date(item.happenedAt).getTime()
      if (Number.isNaN(itemTime)) return false
      return itemTime >= threshold
    })
  }, [activityQuery.data, dateWindow, nowTimestamp, typeFilter])

  return (
    <Card title="Activity Feed" className="p-4 xl:col-span-3">
      {activityQuery.isLoading ? <p className="text-sm text-brand-muted">Loading activity…</p> : null}
      {activityQuery.isError ? <p className="text-sm text-rose-300">Unable to load activity right now.</p> : null}

      {!activityQuery.isLoading && !activityQuery.isError ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.15em] text-brand-muted">
            Source
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="input-compact mt-1 w-full"
            >
              <option value="all">All sources</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {formatActivityType(type)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs uppercase tracking-[0.15em] text-brand-muted">
            Date range
            <select
              value={dateWindow}
              onChange={(event) => setDateWindow(event.target.value as DateWindow)}
              className="input-compact mt-1 w-full"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </label>
        </div>
      ) : null}

      <div className="space-y-2">
        {filteredItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectTab?.(getTabForActivityType(item.type), `${item.type}:${item.entityId}`)}
            className="w-full rounded-2xl border border-border/40 bg-surface-muted/40 p-3 text-left transition hover:border-brand-primary/50"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-white">{item.title}</p>
              <p className="text-xs uppercase tracking-[0.15em] text-brand-muted">{formatActivityType(item.type)}</p>
            </div>
            <p className="mt-1 text-xs text-brand-muted">{item.detail}</p>
            <p className="mt-1 text-xs text-brand-muted">{formatDateTime(item.happenedAt)}</p>
          </button>
        ))}

        {!activityQuery.isLoading && !activityQuery.isError && !(activityQuery.data?.length ?? 0) ? (
          <p className="text-sm text-brand-muted">No activity recorded yet for this lead.</p>
        ) : null}

        {!activityQuery.isLoading && !activityQuery.isError && (activityQuery.data?.length ?? 0) > 0 && !filteredItems.length ? (
          <p className="text-sm text-brand-muted">No activity matches the selected filters.</p>
        ) : null}
      </div>
    </Card>
  )
}

function getWindowThreshold(window: DateWindow, now: number): number | null {
  if (window === 'all') return null
  if (window === '7d') return now - 7 * 24 * 60 * 60 * 1000
  if (window === '30d') return now - 30 * 24 * 60 * 60 * 1000
  return now - 90 * 24 * 60 * 60 * 1000
}

function formatActivityType(type: string) {
  return type.replace('_', ' ')
}

function getTabForActivityType(type: string): LeadProfileTab {
  if (type === 'message') return 'messages'
  if (type === 'internal_note') return 'tasks'
  if (type === 'contract') return 'contracts'
  if (type === 'questionnaire') return 'questionnaires'
  if (type === 'invoice') return 'quotes-orders'
  if (type === 'file') return 'files'
  if (type === 'payable') return 'financials'
  return 'tasks'
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}
