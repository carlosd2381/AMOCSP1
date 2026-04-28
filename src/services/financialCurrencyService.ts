import { supabaseClient } from '@/lib/supabase'
import { fetchFinancialSettingsByBrandId } from '@/services/financialSettingsService'

export async function resolveFinancialDefaultCurrency(brandId: string): Promise<'USD' | 'MXN'> {
  try {
    const financials = await fetchFinancialSettingsByBrandId(brandId)
    return financials.defaultCurrency
  } catch (error) {
    console.error('Unable to resolve financial default currency', error)
    return 'MXN'
  }
}

export async function resolveLeadDefaultCurrency(leadId: string): Promise<'USD' | 'MXN'> {
  const { data: leadRow, error: leadError } = await supabaseClient
    .from('leads')
    .select('brand_id')
    .eq('id', leadId)
    .maybeSingle()

  if (leadError) {
    throw leadError
  }

  if (!leadRow?.brand_id) {
    return 'MXN'
  }

  return resolveFinancialDefaultCurrency(leadRow.brand_id)
}

export async function resolveEventDefaultCurrency(eventId: string): Promise<'USD' | 'MXN'> {
  const { data: eventRow, error: eventError } = await supabaseClient
    .from('events')
    .select('brand_id')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    throw eventError
  }

  if (!eventRow?.brand_id) {
    return 'MXN'
  }

  return resolveFinancialDefaultCurrency(eventRow.brand_id)
}
