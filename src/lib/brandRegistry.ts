import { supabaseClient } from './supabase'
import { isBrandSlug } from './brandGuards'
import { type BrandSlug } from '@/types'

const slugToUuidCache = new Map<BrandSlug, string>()
const uuidToSlugCache = new Map<string, BrandSlug>()

let didHydrateCache = false

async function hydrateBrandCache() {
  if (didHydrateCache) return

  const { data, error } = await supabaseClient
    .from('brands')
    .select('id, slug')
    .in('slug', ['amo', 'csp'])

  if (error) {
    throw error
  }

  data?.forEach((row) => {
    if (isBrandSlug(row.slug)) {
      slugToUuidCache.set(row.slug, row.id)
      uuidToSlugCache.set(row.id, row.slug)
    }
  })

  didHydrateCache = true
}

export async function getBrandUuidFromSlug(slug: BrandSlug): Promise<string> {
  if (slugToUuidCache.has(slug)) {
    return slugToUuidCache.get(slug) as string
  }

  await hydrateBrandCache()

  if (slugToUuidCache.has(slug)) {
    return slugToUuidCache.get(slug) as string
  }

  const { data, error } = await supabaseClient
    .from('brands')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) {
    throw (
      error ??
      new Error(
        `Brand "${slug}" not found in table brands. Run supabase/schema.sql (or supabase db push) so default brand rows are created.`,
      )
    )
  }

  slugToUuidCache.set(slug, data.id)
  if (isBrandSlug(data.slug)) {
    uuidToSlugCache.set(data.id, data.slug)
  }
  return data.id
}

export async function getBrandSlugFromUuid(uuid?: string | null): Promise<BrandSlug | undefined> {
  if (!uuid) return undefined
  if (uuidToSlugCache.has(uuid)) {
    return uuidToSlugCache.get(uuid)
  }

  await hydrateBrandCache()

  if (uuidToSlugCache.has(uuid)) {
    return uuidToSlugCache.get(uuid)
  }

  const { data, error } = await supabaseClient
    .from('brands')
    .select('slug, id')
    .eq('id', uuid)
    .maybeSingle()

  if (error || !data) {
    return undefined
  }

  if (isBrandSlug(data.slug)) {
    uuidToSlugCache.set(uuid, data.slug)
    slugToUuidCache.set(data.slug, data.id)
    return data.slug
  }

  return undefined
}

export function primeBrandCache(entries: Array<{ slug: BrandSlug; id: string }>) {
  entries.forEach(({ slug, id }) => {
    slugToUuidCache.set(slug, id)
    uuidToSlugCache.set(id, slug)
  })
}

export function clearBrandCache() {
  slugToUuidCache.clear()
  uuidToSlugCache.clear()
  didHydrateCache = false
}
