const prefetchers: Record<string, () => Promise<unknown>> = {
  '/': () => import('@/modules/dashboard/pages/AdminDashboardPage'),
  '/leads': () => import('@/modules/leads/pages/LeadsBoardPage'),
  '/quotes': () => import('@/modules/quotes/pages/QuotesListPage'),
  '/contracts': () => import('@/modules/contracts/pages/ContractsListPage'),
  '/invoices': () => import('@/modules/invoices/pages/InvoicesListPage'),
  '/galleries': () => import('@/modules/gallery/pages/GalleryOverviewPage'),
  '/settings': () => import('@/modules/settings/pages/SettingsHomePage'),
  '/settings/company-details': () => import('@/modules/settings/pages/CompanyDetailsSettingsPage'),
  '/settings/financials': () => import('@/modules/settings/pages/FinancialSettingsPage'),
  '/settings/payment-schedules': () => import('@/modules/settings/pages/PaymentSchedulesSettingsPage'),
  '/settings/questionnaire-templates': () => import('@/modules/settings/pages/QuestionnaireTemplatesSettingsPage'),
  '/settings/products-services': () => import('@/modules/settings/pages/ProductsServicesSettingsPage'),
  '/portal/preview': () => import('@/modules/portal/pages/ClientPortalHome'),
  '/auth/login': () => import('@/modules/auth/pages/LoginPage'),
}

const prefetched = new Set<string>()
let didPrefetchLeadProfile = false
const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV

export interface RoutePrefetchMetric {
  prefetchCalls: number
  prefetchLoads: number
  prefetchFailures: number
  navigations: number
  warmNavigations: number
}

const metrics = new Map<string, RoutePrefetchMetric>()

function getMetric(path: string): RoutePrefetchMetric {
  const existing = metrics.get(path)
  if (existing) return existing

  const metric: RoutePrefetchMetric = {
    prefetchCalls: 0,
    prefetchLoads: 0,
    prefetchFailures: 0,
    navigations: 0,
    warmNavigations: 0,
  }
  metrics.set(path, metric)
  return metric
}

function logPrefetchTrace(path: string, message: string, details?: Record<string, unknown>) {
  if (!isDev) return
  console.debug('[route-prefetch]', message, { path, ...details })
}

export function prefetchRouteByPath(path: string) {
  const metric = getMetric(path)
  metric.prefetchCalls += 1

  const prefetch = prefetchers[path]
  if (!prefetch) {
    logPrefetchTrace(path, 'missing-prefetcher')
    return
  }

  if (prefetched.has(path)) {
    logPrefetchTrace(path, 'already-prefetched', { prefetchCalls: metric.prefetchCalls })
    return
  }

  prefetched.add(path)
  metric.prefetchLoads += 1
  logPrefetchTrace(path, 'prefetch-started', { prefetchLoads: metric.prefetchLoads })

  void prefetch()
    .then(() => {
      logPrefetchTrace(path, 'prefetch-complete')
    })
    .catch(() => {
      metric.prefetchFailures += 1
      prefetched.delete(path)
      logPrefetchTrace(path, 'prefetch-failed', { prefetchFailures: metric.prefetchFailures })
    })
}

export function prefetchLeadProfileRoute() {
  const routeKey = '/leads/:leadId'
  const metric = getMetric(routeKey)
  metric.prefetchCalls += 1

  if (didPrefetchLeadProfile) return
  didPrefetchLeadProfile = true
  metric.prefetchLoads += 1
  logPrefetchTrace(routeKey, 'prefetch-started', { prefetchLoads: metric.prefetchLoads })

  void import('@/modules/leads/pages/LeadProfilePage')
    .then(() => {
      logPrefetchTrace(routeKey, 'prefetch-complete')
    })
    .catch(() => {
      metric.prefetchFailures += 1
      didPrefetchLeadProfile = false
      logPrefetchTrace(routeKey, 'prefetch-failed', { prefetchFailures: metric.prefetchFailures })
    })
}

export function trackRouteNavigation(path: string) {
  const metric = getMetric(path)
  metric.navigations += 1

  const isWarm = prefetched.has(path) || (path === '/leads/:leadId' && didPrefetchLeadProfile)
  if (isWarm) {
    metric.warmNavigations += 1
  }

  logPrefetchTrace(path, isWarm ? 'navigation-warm' : 'navigation-cold', {
    navigations: metric.navigations,
    warmNavigations: metric.warmNavigations,
    warmRate: metric.navigations ? Number((metric.warmNavigations / metric.navigations).toFixed(2)) : 0,
  })
}

export function getRoutePrefetchMetrics() {
  return Object.fromEntries(metrics.entries())
}

export function resetRoutePrefetchMetrics() {
  metrics.clear()
  prefetched.clear()
  didPrefetchLeadProfile = false
  logPrefetchTrace('*', 'metrics-reset')
}
