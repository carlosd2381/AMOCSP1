import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { fetchLeadById } from '@/services/leadService'
import { useBranding } from '@/contexts/BrandingContext'
import { LeadProfileHeader } from '@/modules/leads/components/profile/LeadProfileHeader'
import { getSectionsForTab, isLeadProfileTab, type LeadProfileTab } from '@/modules/leads/profile/leadProfileTabs'

const LeadOverviewTab = lazy(() =>
  import('@/modules/leads/components/profile/LeadOverviewTab').then((module) => ({ default: module.LeadOverviewTab })),
)
const LeadScheduleTab = lazy(() =>
  import('@/modules/leads/components/profile/LeadScheduleTab').then((module) => ({ default: module.LeadScheduleTab })),
)
const LeadContactsTab = lazy(() =>
  import('@/modules/leads/components/profile/LeadContactsTab').then((module) => ({ default: module.LeadContactsTab })),
)
const LeadQuotesOrdersTab = lazy(() =>
  import('@/modules/leads/components/profile/LeadQuotesOrdersTab').then((module) => ({ default: module.LeadQuotesOrdersTab })),
)
const LeadFinancialsTab = lazy(() =>
  import('@/modules/leads/components/profile/LeadFinancialsTab').then((module) => ({ default: module.LeadFinancialsTab })),
)
const LeadTasksTab = lazy(() =>
  import('@/modules/leads/components/profile/LeadTasksTab').then((module) => ({ default: module.LeadTasksTab })),
)
const LeadContractsTab = lazy(() =>
  import('@/modules/leads/components/profile/LeadContractsTab').then((module) => ({ default: module.LeadContractsTab })),
)
const LeadQuestionnairesTab = lazy(() =>
  import('@/modules/leads/components/profile/LeadQuestionnairesTab').then((module) => ({ default: module.LeadQuestionnairesTab })),
)
const LeadMessagesTab = lazy(() =>
  import('@/modules/leads/components/profile/LeadMessagesTab').then((module) => ({ default: module.LeadMessagesTab })),
)
const LeadFilesTab = lazy(() =>
  import('@/modules/leads/components/profile/LeadFilesTab').then((module) => ({ default: module.LeadFilesTab })),
)

export function LeadProfilePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { leadId } = useParams<{ leadId: string }>()
  const { brand } = useBranding()

  const tabFromUrl = useMemo<LeadProfileTab>(() => {
    const rawTab = searchParams.get('tab')
    if (rawTab === 'internal-notes') return 'tasks'
    return isLeadProfileTab(rawTab) ? rawTab : 'overview'
  }, [searchParams])

  const [activeTab, setActiveTab] = useState<LeadProfileTab>(tabFromUrl)
  const focusFromUrl = searchParams.get('focus')
  const focusedTaskId = focusFromUrl?.startsWith('task:') ? focusFromUrl.slice(5) : null
  const focusedMessageId = focusFromUrl?.startsWith('message:') ? focusFromUrl.slice(8) : null
  const focusedFileId = focusFromUrl?.startsWith('file:') ? focusFromUrl.slice(5) : null
  const focusedContractId = focusFromUrl?.startsWith('contract:') ? focusFromUrl.slice(9) : null
  const focusedQuestionnaireId = focusFromUrl?.startsWith('questionnaire:') ? focusFromUrl.slice(14) : null
  const focusedNoteId = focusFromUrl?.startsWith('internal_note:') ? focusFromUrl.slice(14) : null
  const focusedInvoiceId = focusFromUrl?.startsWith('invoice:') ? focusFromUrl.slice(8) : null
  const focusedPayableId = focusFromUrl?.startsWith('payable:') ? focusFromUrl.slice(8) : null

  useEffect(() => {
    setActiveTab(tabFromUrl)
  }, [tabFromUrl])

  const handleTabSelect = (tab: LeadProfileTab, focusTarget?: string) => {
    setActiveTab(tab)
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (tab === 'overview') {
        next.delete('tab')
      } else {
        next.set('tab', tab)
      }
      if (focusTarget) {
        next.set('focus', focusTarget)
      } else {
        next.delete('focus')
      }
      return next
    }, { replace: true })
  }

  const { data: lead, isLoading, isError } = useQuery({
    queryKey: ['lead-profile', leadId],
    queryFn: async () => {
      if (!leadId) {
        throw new Error('Missing lead id')
      }
      return fetchLeadById(leadId)
    },
    enabled: Boolean(leadId),
  })

  if (isLoading) {
    return <p className="text-sm text-brand-muted">Loading lead profile…</p>
  }

  if (isError || !lead) {
    return (
      <Card title="Lead not found" className="p-4">
        <p className="text-sm text-brand-muted">This lead could not be loaded. It may have been removed.</p>
        <button
          type="button"
          onClick={() => navigate('/leads')}
          className="mt-4 rounded-2xl border border-brand-primary/40 bg-brand-primary/20 px-4 py-2 text-sm text-white"
        >
          Back to leads
        </button>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <LeadProfileHeader lead={lead} activeTab={activeTab} onTabSelect={handleTabSelect} />

      <Suspense fallback={<p className="text-sm text-brand-muted">Loading tab…</p>}>
        {activeTab === 'overview' ? <LeadOverviewTab lead={lead} onSelectTab={handleTabSelect} /> : null}
        {activeTab === 'schedule' ? <LeadScheduleTab lead={lead} /> : null}
        {activeTab === 'contacts' ? <LeadContactsTab lead={lead} /> : null}
        {activeTab === 'quotes-orders' ? <LeadQuotesOrdersTab lead={lead} focusInvoiceId={focusedInvoiceId} /> : null}
        {activeTab === 'financials' ? <LeadFinancialsTab lead={lead} focusPayableId={focusedPayableId} /> : null}
        {activeTab === 'tasks' ? <LeadTasksTab lead={lead} focusTaskId={focusedTaskId} focusNoteId={focusedNoteId} /> : null}
        {activeTab === 'contracts' ? <LeadContractsTab lead={lead} focusContractId={focusedContractId} /> : null}
        {activeTab === 'questionnaires' ? <LeadQuestionnairesTab lead={lead} focusQuestionnaireId={focusedQuestionnaireId} /> : null}
        {activeTab === 'messages' ? <LeadMessagesTab lead={lead} focusMessageId={focusedMessageId} /> : null}
        {activeTab === 'files' ? <LeadFilesTab lead={lead} focusFileId={focusedFileId} /> : null}
      </Suspense>
      {activeTab !== 'overview' && activeTab !== 'schedule' && activeTab !== 'contacts' && activeTab !== 'quotes-orders' && activeTab !== 'financials' && activeTab !== 'tasks' && activeTab !== 'contracts' && activeTab !== 'questionnaires' && activeTab !== 'messages' && activeTab !== 'files' ? (
        getSectionsForTab(activeTab, brand.slug).map((section) => (
          <Card
            key={section.title}
            title={section.title}
            actions={
              section.actionLabel ? (
                <button
                  type="button"
                  className="rounded-xl border border-brand-primary/40 bg-brand-primary/15 px-3 py-1 text-xs text-white"
                >
                  {section.actionLabel}
                </button>
              ) : null
            }
          >
            <div className="rounded-2xl border border-dashed border-border/50 bg-surface-muted/40 p-4">
              <p className="text-sm text-brand-muted">{section.description}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-brand-muted/80">Placeholder section</p>
            </div>
          </Card>
        ))
      ) : null}
    </div>
  )
}
