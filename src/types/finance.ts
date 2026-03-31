import type { BrandSlug } from './brand'

export type TaxCode = 'IVA' | 'IVA_RET' | 'ISR' | 'ISR_RET'

export interface TaxLine {
  code: TaxCode
  displayName: string
  rate: number
  amount: number
  baseAmount: number
  isWithheld?: boolean
}

export interface LineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  discounts?: number
  taxes?: TaxLine[]
}

export interface ProposalRecord {
  id: string
  leadId: string
  brandId: BrandSlug
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
  lineItems: LineItem[]
  currency: string
  validUntil: string
  paymentSchedule: Array<{
    label: string
    amount: number
    dueDate: string
  }>
  totals: {
    subtotal: number
    taxes: TaxLine[]
    grandTotal: number
  }
}
