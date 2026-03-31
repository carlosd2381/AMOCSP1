import { TAB_ORDER, TAB_LABELS, type LeadProfileTab } from '@/modules/leads/profile/leadProfileTabs'

interface LeadProfileTabsProps {
  activeTab: LeadProfileTab
  onSelect: (tab: LeadProfileTab) => void
}

export function LeadProfileTabs({ activeTab, onSelect }: LeadProfileTabsProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {TAB_ORDER.map((tab) => {
        const isActive = tab === activeTab
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onSelect(tab)}
            className={[
              'rounded-2xl border px-3 py-2 text-left text-sm transition',
              isActive
                ? 'border-brand-primary/60 bg-brand-primary/20 text-white'
                : 'border-border/40 bg-surface-muted/50 text-brand-muted hover:border-border/80 hover:text-white',
            ].join(' ')}
          >
            {TAB_LABELS[tab]}
          </button>
        )
      })}
    </div>
  )
}
