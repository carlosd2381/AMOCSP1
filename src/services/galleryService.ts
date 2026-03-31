import { supabaseClient } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'

type GalleryRow = Database['public']['Tables']['galleries']['Row'] & {
  media_items?: Array<{ count?: number }>
}

export interface GallerySummary {
  id: string
  title: string
  status: GalleryRow['status']
  password: string | null
  coverImg: string | null
  items: number
}

export async function fetchGalleries(brandSlug: BrandSlug, isPortal?: boolean): Promise<GallerySummary[]> {
  const brandUuid = await getBrandUuidFromSlug(brandSlug)

  let query = supabaseClient
    .from('galleries')
    .select('id, title, status, password, cover_img, media_items:media_items(count)')
    .eq('brand_id', brandUuid)
    .order('updated_at', { ascending: false })

  if (isPortal) {
    query = query.eq('status', 'published')
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return ((data ?? []) as unknown as GalleryRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    password: row.password,
    coverImg: row.cover_img,
    items: row.media_items?.[0]?.count ?? 0,
  }))
}
