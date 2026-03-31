import { Bell, Search, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useBranding } from '@/contexts/BrandingContext'
import clsx from 'clsx'

export function TopBar() {
  const { user, signOut } = useAuth()
  const { brand, switchBrand } = useBranding()

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-4xl border border-border/40 bg-surface/70 px-4 py-3 shadow-card lg:flex-nowrap lg:px-5">
      <div className="flex items-center gap-1.5 lg:gap-2">
        <button
          type="button"
          onClick={() => switchBrand('amo')}
          className={clsx(
            'rounded-2xl border px-3 py-1.5 text-xs font-semibold transition lg:px-4 lg:py-2 lg:text-sm',
            brand.slug === 'amo'
              ? 'border-brand-primary/60 bg-brand-primary/20 text-white'
              : 'border-border/50 text-brand-muted hover:border-border/90 hover:text-white',
          )}
        >
          AMO
        </button>
        <button
          type="button"
          onClick={() => switchBrand('csp')}
          className={clsx(
            'rounded-2xl border px-3 py-1.5 text-xs font-semibold transition lg:px-4 lg:py-2 lg:text-sm',
            brand.slug === 'csp'
              ? 'border-brand-primary/60 bg-brand-primary/20 text-white'
              : 'border-border/50 text-brand-muted hover:border-border/90 hover:text-white',
          )}
        >
          CSP
        </button>
      </div>
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="relative hidden lg:block">
          <input
            type="text"
            placeholder="Search leads, invoices, events"
            className="w-52 rounded-2xl border border-border/50 bg-transparent px-3 py-2 text-sm text-white placeholder:text-brand-muted focus:border-brand-primary/60 focus:outline-none xl:w-64 2xl:w-72"
          />
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
        </div>
        <button
          type="button"
          className="rounded-2xl border border-border/50 p-2 text-brand-muted transition hover:text-white"
          aria-label="Notifications"
        >
          <Bell size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-2xl border border-border/50 bg-brand-primary/20" />
          <div className="hidden text-sm xl:block">
            <p className="font-semibold text-white">{user?.fullName ?? 'Team Member'}</p>
            <p className="text-xs uppercase tracking-widest text-brand-muted">{user?.role ?? 'guest'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          aria-label="Sign out"
          className="hidden rounded-2xl border border-border/40 p-2 text-brand-muted transition hover:border-brand-primary/40 hover:text-white md:inline-flex"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
