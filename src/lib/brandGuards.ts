import { type BrandSlug } from '@/types'

export function isBrandSlug(value: unknown): value is BrandSlug {
  return value === 'amo' || value === 'csp'
}
