import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useBranding } from '@/contexts/BrandingContext'
import { fetchPortalContext } from '@/services/portalService'

export function usePortalContext() {
  const { brand } = useBranding()
  const [searchParams] = useSearchParams()
  const leadId = searchParams.get('leadId')?.trim() || undefined

  return useQuery({
    queryKey: ['portal-context', brand.slug, leadId],
    queryFn: () => fetchPortalContext(brand.slug, { leadId }),
    staleTime: 1000 * 30,
  })
}
