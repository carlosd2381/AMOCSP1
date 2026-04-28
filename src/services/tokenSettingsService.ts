import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type Json } from '@/lib/database.types'
import { supabaseClient } from '@/lib/supabase'
import { type BrandSlug } from '@/types'

export type TokenScope = 'documents' | 'emails' | 'all'

export interface TemplateTokenDefinition {
  id: string
  key: string
  label: string
  description: string
  exampleValue: string
  scope: TokenScope
  isActive: boolean
}

export interface TokenSettings {
  customTokens: TemplateTokenDefinition[]
}

export const SYSTEM_TEMPLATE_TOKENS: TemplateTokenDefinition[] = [
  {
    id: 'client-name',
    key: 'client_name',
    label: 'Client Name',
    description: 'Primary client display name for contracts and proposals.',
    exampleValue: 'Jane Doe',
    scope: 'all',
    isActive: true,
  },
  {
    id: 'brand',
    key: 'brand',
    label: 'Brand Name',
    description: 'Current brand label used on documents and outbound messages.',
    exampleValue: 'Amo Studio MX',
    scope: 'all',
    isActive: true,
  },
  {
    id: 'event-date',
    key: 'event_date',
    label: 'Event Date',
    description: 'Resolved event date for lead or booking.',
    exampleValue: '2026-11-20',
    scope: 'all',
    isActive: true,
  },
  {
    id: 'event-location',
    key: 'event_location',
    label: 'Event Location',
    description: 'Venue/location label for event-related templates.',
    exampleValue: 'Cancun, Quintana Roo',
    scope: 'all',
    isActive: true,
  },
  {
    id: 'event-time',
    key: 'event_time',
    label: 'Event Time',
    description: 'Human-readable event time window.',
    exampleValue: '16:00 - 23:00',
    scope: 'all',
    isActive: true,
  },
  {
    id: 'order-summary',
    key: 'order_summary',
    label: 'Order Summary',
    description: 'Text summary of package/services selected.',
    exampleValue: 'Photo + Video Premium Collection',
    scope: 'documents',
    isActive: true,
  },
  {
    id: 'order-total',
    key: 'order_total',
    label: 'Order Total',
    description: 'Total quote/order amount including taxes.',
    exampleValue: 'MXN 95,000.00',
    scope: 'all',
    isActive: true,
  },
  {
    id: 'payment-schedule-summary',
    key: 'payment_schedule_summary',
    label: 'Payment Schedule Summary',
    description: 'Human-readable breakdown of payment milestones.',
    exampleValue: '35% booking, 35% 90 days prior, 30% 30 days prior',
    scope: 'documents',
    isActive: true,
  },
]

const EMPTY_TOKEN_SETTINGS: TokenSettings = {
  customTokens: [],
}

const TOKEN_SCOPES: TokenScope[] = ['documents', 'emails', 'all']

function parseSettings(settings: Json | null | undefined) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {}
  }

  return settings as Record<string, Json>
}

function sanitizeText(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

function sanitizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function sanitizeTokenScope(value: unknown, fallback: TokenScope): TokenScope {
  return TOKEN_SCOPES.includes(value as TokenScope) ? (value as TokenScope) : fallback
}

function sanitizeTokenKey(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const normalized = text.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function normalizeToken(payload: unknown, index: number): TemplateTokenDefinition {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      id: `custom-token-${index + 1}`,
      key: `custom_token_${index + 1}`,
      label: `Custom Token ${index + 1}`,
      description: '',
      exampleValue: '',
      scope: 'all',
      isActive: true,
    }
  }

  const source = payload as Record<string, unknown>
  const fallbackKey = `custom_token_${index + 1}`

  return {
    id: sanitizeText(source.id, `custom-token-${index + 1}`),
    key: sanitizeTokenKey(source.key, fallbackKey),
    label: sanitizeText(source.label, `Custom Token ${index + 1}`),
    description: typeof source.description === 'string' ? source.description.trim() : '',
    exampleValue: typeof source.exampleValue === 'string' ? source.exampleValue.trim() : '',
    scope: sanitizeTokenScope(source.scope, 'all'),
    isActive: sanitizeBoolean(source.isActive, true),
  }
}

function dedupeTokens(tokens: TemplateTokenDefinition[]): TemplateTokenDefinition[] {
  const seenKeys = new Set<string>()
  const deduped: TemplateTokenDefinition[] = []

  for (const token of tokens) {
    if (!token.key || seenKeys.has(token.key)) continue
    seenKeys.add(token.key)
    deduped.push(token)
  }

  return deduped
}

function normalizeTokenSettings(payload: unknown): TokenSettings {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return EMPTY_TOKEN_SETTINGS
  }

  const source = payload as Record<string, unknown>
  const customTokens = Array.isArray(source.customTokens)
    ? source.customTokens.map((token, index) => normalizeToken(token, index))
    : []

  return {
    customTokens: dedupeTokens(customTokens),
  }
}

export function buildTemplateTokenReference(settings: TokenSettings): TemplateTokenDefinition[] {
  const custom = settings.customTokens.filter((token) => token.isActive)
  return [...SYSTEM_TEMPLATE_TOKENS, ...custom]
}

export async function fetchTokenSettings(brandSlug: BrandSlug): Promise<TokenSettings> {
  const brandId = await getBrandUuidFromSlug(brandSlug)
  return fetchTokenSettingsByBrandId(brandId)
}

export async function fetchTokenSettingsByBrandId(brandId: string): Promise<TokenSettings> {
  const { data, error } = await supabaseClient
    .from('brands')
    .select('settings')
    .eq('id', brandId)
    .maybeSingle()

  if (error) {
    throw error
  }

  const settings = parseSettings(data?.settings)
  return normalizeTokenSettings(settings.templateTokens)
}

export async function saveTokenSettings(
  brandSlug: BrandSlug,
  payload: TokenSettings,
): Promise<TokenSettings> {
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
  const nextTokenSettings = normalizeTokenSettings(payload)

  const nextSettings: Json = {
    ...currentSettings,
    templateTokens: nextTokenSettings as unknown as Json,
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

  return nextTokenSettings
}
