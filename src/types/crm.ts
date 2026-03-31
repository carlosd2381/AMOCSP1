import type { BrandSlug } from './brand'

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
