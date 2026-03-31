import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { getRoutePrefetchMetrics, resetRoutePrefetchMetrics, type RoutePrefetchMetric } from '@/routes/routePrefetch'

interface MetricsRow {
  path: string
  metric: RoutePrefetchMetric
  warmRate: string
}

export function PrefetchDiagnosticsCard() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 1500)
    return () => window.clearInterval(interval)
  }, [])

  const rows: MetricsRow[] = (() => {
    if (tick < 0) return []
    const snapshot = getRoutePrefetchMetrics() as Record<string, RoutePrefetchMetric>
    return Object.entries(snapshot)
      .map(([path, metric]) => ({
        path,
        metric,
        warmRate:
          metric.navigations > 0
            ? `${Math.round((metric.warmNavigations / metric.navigations) * 100)}%`
            : 'n/a',
      }))
      .sort((a, b) => b.metric.navigations - a.metric.navigations)
  })()

  return (
    <Card
      className="p-4"
      title="Prefetch Diagnostics (Dev)"
      actions={
        <button
          type="button"
          onClick={() => {
            resetRoutePrefetchMetrics()
            setTick((value) => value + 1)
          }}
          className="rounded-xl border border-border/50 px-3 py-1 text-xs text-brand-muted transition hover:border-border/80 hover:text-white"
        >
          Reset
        </button>
      }
    >
      <p className="mb-2 text-xs text-brand-muted">Live route prefetch telemetry (refreshes every 1.5s).</p>

      {!rows.length ? (
        <p className="text-sm text-brand-muted">No prefetch telemetry yet. Hover sidebar items or lead cards first.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs text-brand-muted">
            <thead>
              <tr className="border-b border-border/40 text-[11px] uppercase tracking-[0.14em]">
                <th className="py-1.5 pr-3">Route</th>
                <th className="py-1.5 pr-3">Prefetch</th>
                <th className="py-1.5 pr-3">Loaded</th>
                <th className="py-1.5 pr-3">Failed</th>
                <th className="py-1.5 pr-3">Navigations</th>
                <th className="py-1.5 pr-0">Warm Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ path, metric, warmRate }) => (
                <tr key={path} className="border-b border-border/20">
                  <td className="py-1.5 pr-3 text-white">{path}</td>
                  <td className="py-1.5 pr-3">{metric.prefetchCalls}</td>
                  <td className="py-1.5 pr-3">{metric.prefetchLoads}</td>
                  <td className="py-1.5 pr-3">{metric.prefetchFailures}</td>
                  <td className="py-1.5 pr-3">{metric.navigations}</td>
                  <td className="py-1.5 pr-0">{warmRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
