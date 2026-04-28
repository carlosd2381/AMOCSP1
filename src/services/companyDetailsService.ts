import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { supabaseClient } from '@/lib/supabase'
import { type Json } from '@/lib/database.types'
import { type BrandSlug } from '@/types'

export interface CompanyDetails {
  legalBusinessName: string
  displayName: string
  taxId: string
  registrationNumber: string
  supportEmail: string
  supportPhone: string
  website: string
  addressLine1: string
  addressLine2: string
  city: string
  stateProvince: string
  postalCode: string
  country: string
  headerNote: string
}

const EMPTY_COMPANY_DETAILS: CompanyDetails = {
  legalBusinessName: '',
  displayName: '',
  taxId: '',
  registrationNumber: '',
  supportEmail: '',
  supportPhone: '',
  website: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  stateProvince: '',
  postalCode: '',
  country: '',
  headerNote: '',
}

function normalizeCompanyDetails(payload: unknown): CompanyDetails {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ...EMPTY_COMPANY_DETAILS }
  }

  const source = payload as Record<string, unknown>

  return {
    legalBusinessName: sanitizeText(source.legalBusinessName),
    displayName: sanitizeText(source.displayName),
    taxId: sanitizeText(source.taxId),
    registrationNumber: sanitizeText(source.registrationNumber),
    supportEmail: sanitizeText(source.supportEmail),
    supportPhone: sanitizeText(source.supportPhone),
    website: sanitizeText(source.website),
    addressLine1: sanitizeText(source.addressLine1),
    addressLine2: sanitizeText(source.addressLine2),
    city: sanitizeText(source.city),
    stateProvince: sanitizeText(source.stateProvince),
    postalCode: sanitizeText(source.postalCode),
    country: sanitizeText(source.country),
    headerNote: sanitizeText(source.headerNote),
  }
}

function sanitizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseSettings(settings: Json | null | undefined) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {}
  }

  return settings as Record<string, Json>
}

export async function fetchCompanyDetails(brandSlug: BrandSlug): Promise<CompanyDetails> {
  const brandId = await getBrandUuidFromSlug(brandSlug)

  return fetchCompanyDetailsByBrandId(brandId)
}

export async function fetchCompanyDetailsByBrandId(brandId: string): Promise<CompanyDetails> {

  const { data, error } = await supabaseClient
    .from('brands')
    .select('settings')
    .eq('id', brandId)
    .maybeSingle()

  if (error) {
    throw error
  }

  const settings = parseSettings(data?.settings)
  return normalizeCompanyDetails(settings.companyDetails)
}

export async function saveCompanyDetails(brandSlug: BrandSlug, payload: CompanyDetails): Promise<CompanyDetails> {
  const brandId = await getBrandUuidFromSlug(brandSlug)

  const { data: existingBrand, error: fetchError } = await supabaseClient
    .from('brands')
    .select('settings')
    .eq('id', brandId)
    .maybeSingle()

  if (fetchError) {
    throw fetchError
  }

  const nextCompanyDetails = normalizeCompanyDetails(payload)
  const currentSettings = parseSettings(existingBrand?.settings)

  const nextSettings: Json = {
    ...currentSettings,
    companyDetails: nextCompanyDetails as unknown as Json,
  }

  const { error } = await supabaseClient
    .from('brands')
    .update({
      settings: nextSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', brandId)

  if (error) {
    throw error
  }

  return nextCompanyDetails
}
