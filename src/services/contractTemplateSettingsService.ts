import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type Json } from '@/lib/database.types'
import { supabaseClient } from '@/lib/supabase'
import { type BrandSlug } from '@/types'

export interface ContractTemplateDefinition {
  id: string
  name: string
  isDefault: boolean
  title: string
  bodyHtml: string
}

export interface ContractTemplateSettings {
  applyByDefaultWhenMissing: boolean
  templates: ContractTemplateDefinition[]
}

const EMPTY_CONTRACT_TEMPLATE_SETTINGS: ContractTemplateSettings = {
  applyByDefaultWhenMissing: true,
  templates: [
    {
      id: 'standard-service-agreement',
      name: 'Standard Service Agreement',
      isDefault: true,
      title: 'Production Agreement',
      bodyHtml: '<h2>Production Agreement</h2><p>This agreement is entered into by and between {{brand}} and {{client_name}}.</p><p>Event date: {{event_date}}</p>',
    },
  ],
}

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

function sanitizeBodyHtml(value: unknown, fallback: string) {
  const html = typeof value === 'string' ? value.trim() : ''
  return html || fallback
}

function normalizeTemplate(payload: unknown, index: number): ContractTemplateDefinition {
  const fallback = EMPTY_CONTRACT_TEMPLATE_SETTINGS.templates[0]

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      id: `${fallback.id}-${index + 1}`,
      name: index === 0 ? fallback.name : `Template ${index + 1}`,
      isDefault: index === 0,
      title: fallback.title,
      bodyHtml: fallback.bodyHtml,
    }
  }

  const source = payload as Record<string, unknown>

  return {
    id: sanitizeText(source.id, `contract-template-${index + 1}`),
    name: sanitizeText(source.name, `Template ${index + 1}`),
    isDefault: sanitizeBoolean(source.isDefault, index === 0),
    title: sanitizeText(source.title, 'Production Agreement'),
    bodyHtml: sanitizeBodyHtml(source.bodyHtml, fallback.bodyHtml),
  }
}

function ensureDefaultTemplate(templates: ContractTemplateDefinition[]): ContractTemplateDefinition[] {
  if (!templates.length) {
    return [...EMPTY_CONTRACT_TEMPLATE_SETTINGS.templates]
  }

  const firstDefaultIndex = templates.findIndex((template) => template.isDefault)
  const defaultIndex = firstDefaultIndex >= 0 ? firstDefaultIndex : 0

  return templates.map((template, index) => ({
    ...template,
    isDefault: index === defaultIndex,
  }))
}

function normalizeContractTemplateSettings(payload: unknown): ContractTemplateSettings {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      applyByDefaultWhenMissing: EMPTY_CONTRACT_TEMPLATE_SETTINGS.applyByDefaultWhenMissing,
      templates: [...EMPTY_CONTRACT_TEMPLATE_SETTINGS.templates],
    }
  }

  const source = payload as Record<string, unknown>

  const templates = Array.isArray(source.templates)
    ? source.templates.map((template, index) => normalizeTemplate(template, index))
    : []

  const normalizedTemplates = ensureDefaultTemplate(templates)

  return {
    applyByDefaultWhenMissing: sanitizeBoolean(
      source.applyByDefaultWhenMissing,
      EMPTY_CONTRACT_TEMPLATE_SETTINGS.applyByDefaultWhenMissing,
    ),
    templates: normalizedTemplates.length
      ? normalizedTemplates
      : [...EMPTY_CONTRACT_TEMPLATE_SETTINGS.templates],
  }
}

export async function fetchContractTemplateSettings(brandSlug: BrandSlug): Promise<ContractTemplateSettings> {
  const brandId = await getBrandUuidFromSlug(brandSlug)
  return fetchContractTemplateSettingsByBrandId(brandId)
}

export async function fetchContractTemplateSettingsByBrandId(brandId: string): Promise<ContractTemplateSettings> {
  const { data, error } = await supabaseClient
    .from('brands')
    .select('settings')
    .eq('id', brandId)
    .maybeSingle()

  if (error) {
    throw error
  }

  const settings = parseSettings(data?.settings)
  return normalizeContractTemplateSettings(settings.contractTemplates)
}

export async function saveContractTemplateSettings(
  brandSlug: BrandSlug,
  payload: ContractTemplateSettings,
): Promise<ContractTemplateSettings> {
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
  const nextContractTemplates = normalizeContractTemplateSettings(payload)

  const nextSettings: Json = {
    ...currentSettings,
    contractTemplates: nextContractTemplates as unknown as Json,
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

  return nextContractTemplates
}
