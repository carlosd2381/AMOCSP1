import { type LineItem, type TaxLine, type TaxCode } from '@/types'

const TAX_LABELS: Record<TaxCode, string> = {
  IVA: 'IVA',
  IVA_RET: 'IVA Retenido',
  ISR: 'ISR',
  ISR_RET: 'ISR Retenido',
}

export interface QuoteTaxRates {
  IVA: number
  IVA_RET: number
  ISR: number
  ISR_RET: number
}

const DEFAULT_TAX_RATES: QuoteTaxRates = {
  IVA: 0.16,
  IVA_RET: 0.106667,
  ISR: 0.1,
  ISR_RET: 0.1,
}

export function calculateTaxLines(lineItems: LineItem[], taxRates?: Partial<QuoteTaxRates>): TaxLine[] {
  const rates: QuoteTaxRates = {
    ...DEFAULT_TAX_RATES,
    ...(taxRates ?? {}),
  }

  const aggregated: Record<TaxCode, TaxLine> = {
    IVA: { code: 'IVA', displayName: TAX_LABELS.IVA, rate: rates.IVA, amount: 0, baseAmount: 0 },
    IVA_RET: {
      code: 'IVA_RET',
      displayName: TAX_LABELS.IVA_RET,
      rate: rates.IVA_RET,
      amount: 0,
      baseAmount: 0,
      isWithheld: true,
    },
    ISR: { code: 'ISR', displayName: TAX_LABELS.ISR, rate: rates.ISR, amount: 0, baseAmount: 0 },
    ISR_RET: {
      code: 'ISR_RET',
      displayName: TAX_LABELS.ISR_RET,
      rate: rates.ISR_RET,
      amount: 0,
      baseAmount: 0,
      isWithheld: true,
    },
  }

  lineItems.forEach((item) => {
    const base = item.quantity * item.unitPrice - (item.discounts ?? 0)
    aggregated.IVA.baseAmount += base
    aggregated.IVA.amount += base * aggregated.IVA.rate
    aggregated.ISR.baseAmount += base
    aggregated.ISR.amount += base * aggregated.ISR.rate
  })

  return Object.values(aggregated)
}

export function summarizeQuote(lineItems: LineItem[], taxRates?: Partial<QuoteTaxRates>) {
  const subtotal = lineItems.reduce((acc, item) => acc + item.quantity * item.unitPrice - (item.discounts ?? 0), 0)
  const taxes = calculateTaxLines(lineItems, taxRates)
  const totalTaxes = taxes.reduce((acc, tax) => acc + tax.amount * (tax.isWithheld ? -1 : 1), 0)
  const grandTotal = subtotal + totalTaxes

  return {
    subtotal,
    taxes,
    grandTotal,
  }
}
