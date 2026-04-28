import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type Json } from '@/lib/database.types'
import { supabaseClient } from '@/lib/supabase'
import { type BrandSlug } from '@/types'

export interface FinancialSettings {
  defaultCurrency: 'USD' | 'MXN'
  defaultInvoiceDueDays: number
  defaultPaymentGraceDays: number
  onlinePaymentFeePercent: number
  lateFeePercent: number
  taxDefaults: {
    iva: { enabled: boolean; ratePercent: number }
    ivaRetention: { enabled: boolean; ratePercent: number }
    isr: { enabled: boolean; ratePercent: number }
    isrRetention: { enabled: boolean; ratePercent: number }
  }
  accountingNotes: string
}

const EMPTY_FINANCIAL_SETTINGS: FinancialSettings = {
  defaultCurrency: 'MXN',
  defaultInvoiceDueDays: 7,
  defaultPaymentGraceDays: 2,
  onlinePaymentFeePercent: 3.6,
  lateFeePercent: 0,
  taxDefaults: {
    iva: { enabled: true, ratePercent: 16 },
    ivaRetention: { enabled: false, ratePercent: 10.6667 },
    isr: { enabled: false, ratePercent: 1.25 },
    isrRetention: { enabled: false, ratePercent: 10 },
  },
  accountingNotes: '',
}

function parseSettings(settings: Json | null | undefined) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {}
  }

  return settings as Record<string, Json>
}

function sanitizePercent(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, Number(value.toFixed(4))))
}

function sanitizeDays(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(365, Math.round(value)))
}

function sanitizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeFinancialSettings(payload: unknown): FinancialSettings {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ...EMPTY_FINANCIAL_SETTINGS }
  }

  const source = payload as Record<string, unknown>
  const taxes = source.taxDefaults && typeof source.taxDefaults === 'object' && !Array.isArray(source.taxDefaults)
    ? source.taxDefaults as Record<string, unknown>
    : {}

  const taxBlock = (key: string, fallbackEnabled: boolean, fallbackRate: number) => {
    const row = taxes[key] && typeof taxes[key] === 'object' && !Array.isArray(taxes[key])
      ? taxes[key] as Record<string, unknown>
      : {}

    return {
      enabled: typeof row.enabled === 'boolean' ? row.enabled : fallbackEnabled,
      ratePercent: sanitizePercent(row.ratePercent, fallbackRate),
    }
  }

  return {
    defaultCurrency: source.defaultCurrency === 'USD' ? 'USD' : 'MXN',
    defaultInvoiceDueDays: sanitizeDays(source.defaultInvoiceDueDays, EMPTY_FINANCIAL_SETTINGS.defaultInvoiceDueDays),
    defaultPaymentGraceDays: sanitizeDays(source.defaultPaymentGraceDays, EMPTY_FINANCIAL_SETTINGS.defaultPaymentGraceDays),
    onlinePaymentFeePercent: sanitizePercent(source.onlinePaymentFeePercent, EMPTY_FINANCIAL_SETTINGS.onlinePaymentFeePercent),
    lateFeePercent: sanitizePercent(source.lateFeePercent, EMPTY_FINANCIAL_SETTINGS.lateFeePercent),
    taxDefaults: {
      iva: taxBlock('iva', EMPTY_FINANCIAL_SETTINGS.taxDefaults.iva.enabled, EMPTY_FINANCIAL_SETTINGS.taxDefaults.iva.ratePercent),
      ivaRetention: taxBlock('ivaRetention', EMPTY_FINANCIAL_SETTINGS.taxDefaults.ivaRetention.enabled, EMPTY_FINANCIAL_SETTINGS.taxDefaults.ivaRetention.ratePercent),
      isr: taxBlock('isr', EMPTY_FINANCIAL_SETTINGS.taxDefaults.isr.enabled, EMPTY_FINANCIAL_SETTINGS.taxDefaults.isr.ratePercent),
      isrRetention: taxBlock('isrRetention', EMPTY_FINANCIAL_SETTINGS.taxDefaults.isrRetention.enabled, EMPTY_FINANCIAL_SETTINGS.taxDefaults.isrRetention.ratePercent),
    },
    accountingNotes: sanitizeText(source.accountingNotes),
  }
}

export async function fetchFinancialSettings(brandSlug: BrandSlug): Promise<FinancialSettings> {
  const brandId = await getBrandUuidFromSlug(brandSlug)

  return fetchFinancialSettingsByBrandId(brandId)
}

export async function fetchFinancialSettingsByBrandId(brandId: string): Promise<FinancialSettings> {

  const { data, error } = await supabaseClient
    .from('brands')
    .select('settings')
    .eq('id', brandId)
    .maybeSingle()

  if (error) {
    throw error
  }

  const settings = parseSettings(data?.settings)
  return normalizeFinancialSettings(settings.financials)
}

export async function saveFinancialSettings(brandSlug: BrandSlug, payload: FinancialSettings): Promise<FinancialSettings> {
  const brandId = await getBrandUuidFromSlug(brandSlug)

  const { data: existingBrand, error: fetchError } = await supabaseClient
    .from('brands')
    .select('settings')
    .eq('id', brandId)
    .maybeSingle()

  if (fetchError) {
    throw fetchError
  }

  const currentSettings = parseSettings(existingBrand?.settings)
  const nextFinancials = normalizeFinancialSettings(payload)

  const nextSettings: Json = {
    ...currentSettings,
    financials: nextFinancials as unknown as Json,
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

  return nextFinancials
}
