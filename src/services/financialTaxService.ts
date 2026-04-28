import { fetchFinancialSettingsByBrandId } from '@/services/financialSettingsService'
import { type FinancialSettings } from '@/services/financialSettingsService'
import { type QuoteTaxRates } from '@/services/quoteService'
import { type TaxCode } from '@/types'

export type TaxToggleMap = Record<TaxCode, boolean>

export const DEFAULT_TAX_TOGGLES: TaxToggleMap = {
  IVA: true,
  IVA_RET: false,
  ISR: false,
  ISR_RET: false,
}

export function mapFinancialTaxToggles(
  financialSettings: FinancialSettings | null | undefined,
): TaxToggleMap | undefined {
  if (!financialSettings) return undefined

  return {
    IVA: financialSettings.taxDefaults.iva.enabled,
    IVA_RET: financialSettings.taxDefaults.ivaRetention.enabled,
    ISR: financialSettings.taxDefaults.isr.enabled,
    ISR_RET: financialSettings.taxDefaults.isrRetention.enabled,
  }
}

export async function resolveFinancialTaxToggleDefaults(brandId: string): Promise<TaxToggleMap> {
  try {
    const financials = await fetchFinancialSettingsByBrandId(brandId)
    return mapFinancialTaxToggles(financials) ?? DEFAULT_TAX_TOGGLES
  } catch (error) {
    console.error('Unable to resolve financial tax defaults', error)
    return DEFAULT_TAX_TOGGLES
  }
}

export function mapFinancialTaxRatesToQuoteRates(
  financialSettings: FinancialSettings | null | undefined,
): Partial<QuoteTaxRates> | undefined {
  if (!financialSettings) return undefined

  return {
    IVA: financialSettings.taxDefaults.iva.ratePercent / 100,
    IVA_RET: financialSettings.taxDefaults.ivaRetention.ratePercent / 100,
    ISR: financialSettings.taxDefaults.isr.ratePercent / 100,
    ISR_RET: financialSettings.taxDefaults.isrRetention.ratePercent / 100,
  }
}

export function calculateNetTaxEffectFromFinancialDefaults(
  baseAmount: number,
  financialSettings: FinancialSettings | null | undefined,
): number {
  const rates = mapFinancialTaxRatesToQuoteRates(financialSettings)
  const toggles = mapFinancialTaxToggles(financialSettings)
  if (!rates || !toggles || !Number.isFinite(baseAmount)) {
    return 0
  }

  const iva = toggles.IVA ? baseAmount * (rates.IVA ?? 0) : 0
  const isr = toggles.ISR ? baseAmount * (rates.ISR ?? 0) : 0
  const ivaRetention = toggles.IVA_RET ? -baseAmount * (rates.IVA_RET ?? 0) : 0
  const isrRetention = toggles.ISR_RET ? -baseAmount * (rates.ISR_RET ?? 0) : 0

  return iva + isr + ivaRetention + isrRetention
}
