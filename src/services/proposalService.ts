import { supabaseClient } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug, type LineItem, type TaxCode, type TaxLine } from '@/types'

type ProposalRow = Database['public']['Tables']['proposals']['Row']

type TaxToggleMap = Record<TaxCode, boolean>

const TAX_CODES: TaxCode[] = ['IVA', 'IVA_RET', 'ISR', 'ISR_RET']

interface FetchProposalOptions {
  leadId?: string
}

export interface ProposalSummary {
  id: string
  status: ProposalRow['status']
  currency: string
  lineItems: LineItem[]
  taxes: TaxLine[]
  subtotal: number
  totalAmount: number
  taxToggleDefaults: TaxToggleMap
}

export async function fetchLatestProposal(brandSlug: BrandSlug, options?: FetchProposalOptions): Promise<ProposalSummary | null> {
  const brandUuid = await getBrandUuidFromSlug(brandSlug)

  let query = supabaseClient
    .from('proposals')
    .select('id, status, line_items, taxes, subtotal, total_amount, currency, lead_id')
    .eq('brand_id', brandUuid)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (options?.leadId) {
    query = query.eq('lead_id', options.leadId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  const lineItems = normalizeLineItems(data.line_items)
  const taxes = normalizeTaxLines(data.taxes)

  return {
    id: data.id,
    status: data.status,
    currency: data.currency ?? 'MXN',
    lineItems,
    taxes,
    subtotal: data.subtotal ?? summarizeSubtotal(lineItems),
    totalAmount: data.total_amount ?? summarizeSubtotal(lineItems),
    taxToggleDefaults: buildTaxToggleDefaults(taxes),
  }
}

export async function acceptProposal(proposalId: string) {
  const { error } = await supabaseClient
    .from('proposals')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', proposalId)

  if (error) {
    throw error
  }
}

function normalizeLineItems(payload: ProposalRow['line_items']): LineItem[] {
  if (!payload) return []
  if (Array.isArray(payload)) {
    return payload as unknown as LineItem[]
  }
  return []
}

function normalizeTaxLines(payload: ProposalRow['taxes']): TaxLine[] {
  if (!payload) return []
  if (Array.isArray(payload)) {
    return (payload as unknown as TaxLine[]).map((tax) => ({
      ...tax,
      isWithheld: Boolean(tax.isWithheld),
    }))
  }
  return []
}

function buildTaxToggleDefaults(taxes: TaxLine[]): TaxToggleMap {
  return TAX_CODES.reduce<TaxToggleMap>((acc, code) => {
    acc[code] = taxes.some((tax) => tax.code === code)
    return acc
  }, {
    IVA: false,
    IVA_RET: false,
    ISR: false,
    ISR_RET: false,
  })
}

function summarizeSubtotal(items: LineItem[]): number {
  return items.reduce((acc, item) => acc + item.quantity * item.unitPrice - (item.discounts ?? 0), 0)
}

export const TAX_CODES_ORDER = TAX_CODES
export type { TaxToggleMap, FetchProposalOptions }
