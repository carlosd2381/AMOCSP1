import { type LineItem, type TaxLine, type TaxCode } from '@/types'

const TAX_LABELS: Record<TaxCode, string> = {
  IVA: 'IVA',
  IVA_RET: 'IVA Retenido',
  ISR: 'ISR',
  ISR_RET: 'ISR Retenido',
}

export function calculateTaxLines(lineItems: LineItem[]): TaxLine[] {
  const aggregated: Record<TaxCode, TaxLine> = {
    IVA: { code: 'IVA', displayName: TAX_LABELS.IVA, rate: 0.16, amount: 0, baseAmount: 0 },
    IVA_RET: {
      code: 'IVA_RET',
      displayName: TAX_LABELS.IVA_RET,
      rate: 0.106667,
      amount: 0,
      baseAmount: 0,
      isWithheld: true,
    },
    ISR: { code: 'ISR', displayName: TAX_LABELS.ISR, rate: 0.1, amount: 0, baseAmount: 0 },
    ISR_RET: {
      code: 'ISR_RET',
      displayName: TAX_LABELS.ISR_RET,
      rate: 0.1,
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

export function summarizeQuote(lineItems: LineItem[]) {
  const subtotal = lineItems.reduce((acc, item) => acc + item.quantity * item.unitPrice - (item.discounts ?? 0), 0)
  const taxes = calculateTaxLines(lineItems)
  const totalTaxes = taxes.reduce((acc, tax) => acc + tax.amount * (tax.isWithheld ? -1 : 1), 0)
  const grandTotal = subtotal + totalTaxes

  return {
    subtotal,
    taxes,
    grandTotal,
  }
}
