export const TAB_ORDER = [
  'overview',
  'schedule',
  'contacts',
  'quotes-orders',
  'financials',
  'messages',
  'contracts',
  'questionnaires',
  'tasks',
  'files',
] as const

export type LeadProfileTab = (typeof TAB_ORDER)[number]

export function isLeadProfileTab(value: string | null): value is LeadProfileTab {
  if (!value) return false
  return TAB_ORDER.includes(value as LeadProfileTab)
}

export const TAB_LABELS: Record<LeadProfileTab, string> = {
  overview: 'Overview',
  schedule: 'Schedule',
  contacts: 'Contacts',
  'quotes-orders': 'Quotes & Orders',
  financials: 'Financials',
  messages: 'Messages',
  contracts: 'Contracts',
  questionnaires: 'Questionnaires',
  tasks: 'Tasks',
  files: 'Files',
}

export interface PlaceholderSection {
  title: string
  description: string
  actionLabel?: string
}

export function getSectionsForTab(tab: LeadProfileTab, brandSlug: 'amo' | 'csp'): PlaceholderSection[] {
  void brandSlug
  void tab

  switch (tab) {
    default:
      return []
  }
}
