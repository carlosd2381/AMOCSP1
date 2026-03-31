import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { type LeadRecord } from '@/types'
import { LeadProfileTabs } from './LeadProfileTabs'
import { type LeadProfileTab } from '@/modules/leads/profile/leadProfileTabs'

interface LeadProfileHeaderProps {
  lead: LeadRecord
  activeTab: LeadProfileTab
  onTabSelect: (tab: LeadProfileTab) => void
}

export function LeadProfileHeader({ lead, activeTab, onTabSelect }: LeadProfileHeaderProps) {
  const navigate = useNavigate()

  return (
    <Card
      className="p-4"
      title={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-brand-muted">Lead / Client workspace</p>
            <h1 className="text-xl font-semibold text-white">{lead.client.name}</h1>
            <p className="mt-0.5 text-sm text-brand-muted">
              {lead.client.email} • {lead.client.type === 'couple' ? 'Wedding' : 'Corporate'} • Status {lead.status}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/leads')}
            className="rounded-2xl border border-border/50 px-4 py-2 text-sm text-brand-muted transition hover:border-border/90 hover:text-white"
          >
            Back to board
          </button>
        </div>
      }
    >
      <LeadProfileTabs activeTab={activeTab} onSelect={onTabSelect} />
    </Card>
  )
}
