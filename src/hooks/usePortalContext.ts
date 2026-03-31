import { useQuery } from '@tanstack/react-query'
import { useBranding } from '@/contexts/BrandingContext'
import { fetchPortalContext } from '@/services/portalService'

export function usePortalContext() {
  const { brand } = useBranding()

  return useQuery({
    queryKey: ['portal-context', brand.slug],
    queryFn: () => fetchPortalContext(brand.slug),
    staleTime: 1000 * 30,
  })
}
