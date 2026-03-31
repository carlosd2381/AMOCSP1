import AMOLogo from '@/assets/logos/amo.svg'
import CSPLogo from '@/assets/logos/csp.svg'
import { type BrandSlug, type BrandTheme } from '@/types'

export const BRAND_THEMES: Record<BrandSlug, BrandTheme> = {
  amo: {
    slug: 'amo',
    label: 'AMO',
    type: 'b2c',
    tagline: 'Luxury weddings & storytelling in MX',
    description:
      'Romantic, editorial coverage for weddings, social events, and lifestyle commissions across Mexico and destination locales.',
    primaryColor: '#f95f62',
    secondaryColor: '#f7b267',
    accentColor: '#fff0d8',
    gradient: 'linear-gradient(135deg, #f95f62 0%, #f7b267 55%, #fff0d8 100%)',
    fontSans: '"General Sans", "Inter", system-ui, sans-serif',
    fontDisplay: '"Playfair Display", "Space Grotesk", serif',
    logo: {
      light: AMOLogo,
      dark: AMOLogo,
    },
  },
  csp: {
    slug: 'csp',
    label: 'CSP',
    type: 'b2b',
    tagline: 'Corporate experiences with cinematic polish',
    description:
      'Conventions, corporate experiences, brand films, and industrial storytelling with global production standards.',
    primaryColor: '#21c4d7',
    secondaryColor: '#5c7cfa',
    accentColor: '#e0f2ff',
    gradient: 'linear-gradient(135deg, #21c4d7 0%, #5c7cfa 60%, #e0f2ff 100%)',
    fontSans: '"Neue Haas Grotesk", "Inter", system-ui, sans-serif',
    fontDisplay: '"Space Grotesk", "Inter", system-ui, sans-serif',
    logo: {
      light: CSPLogo,
      dark: CSPLogo,
    },
  },
}

export const BRAND_ORDER: BrandSlug[] = ['amo', 'csp']

export const DEFAULT_BRAND = BRAND_THEMES.amo
