import { useBranding } from '@/contexts/BrandingContext'
import { useQuery } from '@tanstack/react-query'
import { fetchGalleries } from '@/services/galleryService'

interface GalleryOverviewPageProps {
  isPortal?: boolean
}

export function GalleryOverviewPage({ isPortal = false }: GalleryOverviewPageProps) {
  const { brand } = useBranding()
  const { data, isLoading } = useQuery({
    queryKey: ['galleries', brand.slug, isPortal ? 'portal' : 'admin'],
    queryFn: () => fetchGalleries(brand.slug, isPortal),
  })

  if (isLoading && !data) {
    return <p className="text-sm text-brand-muted">Loading galleries…</p>
  }

  if (!data || data.length === 0) {
    return (
      <p className="rounded-3xl border border-border/40 bg-surface/70 p-5 text-sm text-brand-muted">
        No galleries found for {brand.label} yet. Publish a gallery in Supabase to see it here.
      </p>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((gallery) => (
        <article key={gallery.id} className="rounded-3xl border border-border/40 bg-surface/70 p-5 shadow-card">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-brand-muted">Gallery</p>
              <h3 className="text-2xl font-semibold text-white">{gallery.title}</h3>
            </div>
            <span className="rounded-full border border-border/40 px-3 py-1 text-xs uppercase tracking-[0.3em] text-brand-muted">
              {gallery.status}
            </span>
          </header>
          <p className="text-sm text-brand-muted">
            {gallery.items} assets • {gallery.password ? `Protected with ${gallery.password}` : 'Open access'}.
          </p>
          <button
            type="button"
            className="mt-4 w-full rounded-2xl border border-brand-primary/40 bg-brand-primary/10 px-4 py-3 text-sm font-semibold text-white"
          >
            {isPortal ? 'Open gallery' : 'Preview delivery experience'}
          </button>
        </article>
      ))}
    </div>
  )
}
