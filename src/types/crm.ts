import type { BrandSlug } from './brand'

export type ClientMarketType = 'INT' | 'MEX'
export type ClientLanguage = 'en' | 'es'
export type PricingCatalogKey = 'INT_USD_ENG' | 'MEX_MXN_ESP'

export interface ClientMarketProfile {
  clientType: ClientMarketType
  preferredLanguage: ClientLanguage
  preferredCurrency: 'USD' | 'MXN'
  preferredCatalog: PricingCatalogKey
}

export const DEFAULT_CLIENT_MARKET_PROFILE: ClientMarketProfile = {
  clientType: 'INT',
  preferredLanguage: 'en',
  preferredCurrency: 'USD',
  preferredCatalog: 'INT_USD_ENG',
}

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'proposal'
  | 'contract'
  | 'booked'
  | 'lost'

export interface ClientSummary {
  id: string
  name: string
  email: string
  phone?: string
  brandId?: string
  brandSlug?: BrandSlug
  type: 'couple' | 'corporate'
  marketProfile?: ClientMarketProfile
}

export interface LeadRecord {
  id: string
  status: LeadStatus
  client: ClientSummary
  venueName?: string
  eventDate: string
  source?: string
  notes?: string
}

export interface EventRecord {
  id: string
  leadId: string
  title: string
  startTime: string
  endTime: string
  location: {
    lat: number
    lng: number
    address: string
  }
  shootType: 'photo' | 'video' | 'drone' | 'hybrid'
}
