export type BrandSlug = 'amo' | 'csp'

export type BrandType = 'b2c' | 'b2b'

export interface BrandTheme {
  slug: BrandSlug
  label: string
  type: BrandType
  tagline: string
  description: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  gradient: string
  fontSans: string
  fontDisplay: string
  logo: {
    light: string
    dark: string
  }
}
