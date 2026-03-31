import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { BRAND_ORDER, BRAND_THEMES, DEFAULT_BRAND } from '@/lib/brandThemes'
import { type BrandSlug, type BrandTheme } from '@/types'

interface BrandingContextValue {
  brand: BrandTheme
  switchBrand: (slug: BrandSlug) => void
  availableBrands: BrandTheme[]
}

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined)
const STORAGE_KEY = 'amocsp.brand'

export function BrandingProvider({ children }: PropsWithChildren) {
  const [brand, setBrand] = useState<BrandTheme>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(STORAGE_KEY) as BrandSlug | null
      if (saved && BRAND_THEMES[saved]) {
        return BRAND_THEMES[saved]
      }
    }
    return DEFAULT_BRAND
  })

  useEffect(() => {
    document.documentElement.dataset.brand = brand.slug
    document.documentElement.style.setProperty('--font-sans', brand.fontSans)
    document.documentElement.style.setProperty('--font-display', brand.fontDisplay)
    document.documentElement.style.setProperty('--color-brand-primary', brand.primaryColor)
    document.documentElement.style.setProperty('--color-brand-secondary', brand.secondaryColor)
    document.documentElement.style.setProperty('--color-brand-accent', brand.accentColor)
    window.localStorage.setItem(STORAGE_KEY, brand.slug)
  }, [brand])

  const switchBrand = useCallback((slug: BrandSlug) => {
    const nextBrand = BRAND_THEMES[slug]
    if (!nextBrand) return
    setBrand(nextBrand)
  }, [])

  const value = useMemo<BrandingContextValue>(
    () => ({
      brand,
      switchBrand,
      availableBrands: BRAND_ORDER.map((slug) => BRAND_THEMES[slug]),
    }),
    [brand, switchBrand],
  )

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBranding() {
  const ctx = useContext(BrandingContext)
  if (!ctx) {
    throw new Error('useBranding must be used within BrandingProvider')
  }
  return ctx
}
