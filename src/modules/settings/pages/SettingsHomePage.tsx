import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Boxes, Building2, CircleDollarSign, CreditCard, FileStack, FileText, Palette, ReceiptText, ShieldCheck, Users } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface SettingsSectionCard {
  id: string
  title: string
  description: string
  icon: typeof Boxes
  to?: string
  status: 'active' | 'upcoming'
}

const SETTINGS_SECTIONS: SettingsSectionCard[] = [
  {
    id: 'products-services-packages',
    title: 'Products / Services / Packages',
    description: 'Catalog, package composer, quote mapping, and data tools.',
    icon: Boxes,
    to: '/settings/products-services',
    status: 'active',
  },
  {
    id: 'company-details',
    title: 'Company Details',
    description: 'Business profile, legal details, and public contact info.',
    icon: Building2,
    to: '/settings/company-details',
    status: 'active',
  },
  {
    id: 'branding',
    title: 'Branding',
    description: 'Brand assets, color tokens, typography, and themes.',
    icon: Palette,
    status: 'upcoming',
  },
  {
    id: 'financial',
    title: 'Financial',
    description: 'Currency behavior, tax defaults, and accounting options.',
    icon: CircleDollarSign,
    to: '/settings/financials',
    status: 'active',
  },
  {
    id: 'payment-methods',
    title: 'Payment Methods',
    description: 'Gateways, checkout methods, and payment controls.',
    icon: CreditCard,
    status: 'upcoming',
  },
  {
    id: 'payment-schedules',
    title: 'Payment Schedules',
    description: 'Default deposit and installment schedule templates.',
    icon: ReceiptText,
    to: '/settings/payment-schedules',
    status: 'active',
  },
  {
    id: 'contract-templates',
    title: 'Contract Templates',
    description: 'Template library used when turning accepted quotes into contracts.',
    icon: FileText,
    to: '/settings/contract-templates',
    status: 'active',
  },
  {
    id: 'template-tokens',
    title: 'Template Tokens',
    description: 'Central token catalog for documents, emails, and dynamic messaging.',
    icon: FileStack,
    to: '/settings/tokens',
    status: 'active',
  },
  {
    id: 'expense-categories',
    title: 'Expense Categories',
    description: 'Expense groupings for payables and financial reporting.',
    icon: FileStack,
    status: 'upcoming',
  },
  {
    id: 'user-management',
    title: 'User Management',
    description: 'Team members, access policy, and role assignments.',
    icon: Users,
    status: 'upcoming',
  },
  {
    id: 'roles-permissions',
    title: 'Roles & Permissions',
    description: 'Permission matrix and admin capability controls.',
    icon: ShieldCheck,
    status: 'upcoming',
  },
]

export function SettingsHomePage() {
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming'>('all')

  const filteredSections = useMemo(() => {
    if (filter === 'all') return SETTINGS_SECTIONS
    return SETTINGS_SECTIONS.filter((section) => section.status === filter)
  }, [filter])

  const activeCount = SETTINGS_SECTIONS.filter((section) => section.status === 'active').length
  const upcomingCount = SETTINGS_SECTIONS.filter((section) => section.status === 'upcoming').length

  return (
    <div className="space-y-4">
      <Card title="Settings" className="p-4">
        <p className="text-sm text-brand-muted">Manage application configuration by section. Start with Products / Services / Packages, then expand into additional settings.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={filter === 'all' ? 'btn-compact-primary' : 'btn-compact-secondary'}
          >
            All ({SETTINGS_SECTIONS.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={filter === 'active' ? 'btn-compact-primary' : 'btn-compact-secondary'}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('upcoming')}
            className={filter === 'upcoming' ? 'btn-compact-primary' : 'btn-compact-secondary'}
          >
            Upcoming ({upcomingCount})
          </button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filteredSections.map((section) => {
          const Icon = section.icon

          if (section.to) {
            return (
              <Link
                key={section.id}
                to={section.to}
                className="group block border border-brand-primary/40 bg-surface p-4 transition hover:border-brand-primary/75 hover:bg-surface-muted/30"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="inline-flex h-10 w-10 items-center justify-center border border-brand-primary/40 bg-brand-primary/10 text-brand-primary">
                    <Icon size={18} />
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.12em] text-brand-primary">
                    Open
                    <ArrowUpRight size={12} />
                  </span>
                </div>
                <h2 className="text-base font-semibold text-white">{section.title}</h2>
                <p className="mt-1 text-sm text-brand-muted">{section.description}</p>
              </Link>
            )
          }

          return (
            <article
              key={section.id}
              className="border border-border/50 bg-surface p-4 opacity-90"
              aria-label={`${section.title} coming soon`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="inline-flex h-10 w-10 items-center justify-center border border-border/50 bg-surface-muted/30 text-brand-muted">
                  <Icon size={18} />
                </span>
                <span className="text-xs uppercase tracking-[0.12em] text-brand-muted">Coming soon</span>
              </div>
              <h2 className="text-base font-semibold text-white">{section.title}</h2>
              <p className="mt-1 text-sm text-brand-muted">{section.description}</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}
