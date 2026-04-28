import { describe, expect, it } from 'vitest'
import type { FinancialSettings } from '@/services/financialSettingsService'
import {
  DEFAULT_TAX_TOGGLES,
  calculateNetTaxEffectFromFinancialDefaults,
  mapFinancialTaxRatesToQuoteRates,
  mapFinancialTaxToggles,
} from '@/services/financialTaxService'

function createSettings(overrides?: Partial<FinancialSettings>): FinancialSettings {
  return {
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
    ...overrides,
  }
}

describe('financialTaxService', () => {
  it('maps financial settings to quote tax rates', () => {
    const settings = createSettings({
      taxDefaults: {
        iva: { enabled: true, ratePercent: 8 },
        ivaRetention: { enabled: true, ratePercent: 12.5 },
        isr: { enabled: true, ratePercent: 2 },
        isrRetention: { enabled: false, ratePercent: 1 },
      },
    })

    expect(mapFinancialTaxRatesToQuoteRates(settings)).toEqual({
      IVA: 0.08,
      IVA_RET: 0.125,
      ISR: 0.02,
      ISR_RET: 0.01,
    })
  })

  it('maps financial settings to tax toggles', () => {
    const settings = createSettings({
      taxDefaults: {
        iva: { enabled: false, ratePercent: 16 },
        ivaRetention: { enabled: true, ratePercent: 10.6667 },
        isr: { enabled: true, ratePercent: 1.25 },
        isrRetention: { enabled: true, ratePercent: 10 },
      },
    })

    expect(mapFinancialTaxToggles(settings)).toEqual({
      IVA: false,
      IVA_RET: true,
      ISR: true,
      ISR_RET: true,
    })
  })

  it('returns zero net tax effect for missing settings', () => {
    expect(calculateNetTaxEffectFromFinancialDefaults(10000, undefined)).toBe(0)
    expect(calculateNetTaxEffectFromFinancialDefaults(10000, null)).toBe(0)
  })

  it('calculates net tax effect with additive and withheld taxes', () => {
    const settings = createSettings({
      taxDefaults: {
        iva: { enabled: true, ratePercent: 16 },
        ivaRetention: { enabled: true, ratePercent: 10 },
        isr: { enabled: true, ratePercent: 2 },
        isrRetention: { enabled: false, ratePercent: 10 },
      },
    })

    // 10000 * (0.16 + 0.02 - 0.10)
    expect(calculateNetTaxEffectFromFinancialDefaults(10000, settings)).toBeCloseTo(800, 6)
  })

  it('preserves decimal precision for repeating percentage rates', () => {
    const settings = createSettings({
      taxDefaults: {
        iva: { enabled: true, ratePercent: 16 },
        ivaRetention: { enabled: true, ratePercent: 10.6667 },
        isr: { enabled: false, ratePercent: 1.25 },
        isrRetention: { enabled: false, ratePercent: 10 },
      },
    })

    const mapped = mapFinancialTaxRatesToQuoteRates(settings)
    expect(mapped?.IVA_RET).toBeCloseTo(0.106667, 6)

    // 10000 * (0.16 - 0.106667)
    expect(calculateNetTaxEffectFromFinancialDefaults(10000, settings)).toBeCloseTo(533.33, 2)
  })

  it('exposes expected default tax toggles', () => {
    expect(DEFAULT_TAX_TOGGLES).toEqual({
      IVA: true,
      IVA_RET: false,
      ISR: false,
      ISR_RET: false,
    })
  })
})
