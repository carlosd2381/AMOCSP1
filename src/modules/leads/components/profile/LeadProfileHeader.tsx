import { useNavigate } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
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
  const market = lead.client.marketProfile
  const marketLabel = market?.clientType ?? 'INT'
  const languageLabel = market?.preferredLanguage === 'es' ? 'Spanish' : 'English'
  const currencyLabel = market?.preferredCurrency ?? (marketLabel === 'MEX' ? 'MXN' : 'USD')

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
            <p className="mt-0.5 text-xs text-brand-muted">
              Market {marketLabel} • Language {languageLabel} • Currency {currencyLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/portal?leadId=${encodeURIComponent(lead.id)}`)}
              className="inline-flex items-center gap-2 rounded-2xl border border-brand-primary/40 bg-brand-primary/15 px-4 py-2 text-sm text-white transition hover:border-brand-primary/70"
            >
              Client portal
              <ArrowUpRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/leads')}
              className="rounded-2xl border border-border/50 px-4 py-2 text-sm text-brand-muted transition hover:border-border/90 hover:text-white"
            >
              Back to board
            </button>
          </div>
        </div>
      }
    >
      <LeadProfileTabs activeTab={activeTab} onSelect={onTabSelect} />
    </Card>
  )
}
