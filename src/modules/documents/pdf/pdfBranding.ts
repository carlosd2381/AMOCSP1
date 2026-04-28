export function resolvePdfLogoUrl(brandSlug: string, fallbackLogoUrl?: string) {
  if (brandSlug === 'amo') return fallbackLogoUrl
  return fallbackLogoUrl
}
