import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type Json } from '@/lib/database.types'
import { supabaseClient } from '@/lib/supabase'
import { type BrandSlug } from '@/types'

export type QuestionnaireFieldType =
  | 'single_line_text'
  | 'paragraph_text'
  | 'multiple_choice'
  | 'dropdown'
  | 'checkboxes'
  | 'radio_buttons'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'time'

export interface QuestionnaireTemplateField {
  id: string
  label: string
  type: QuestionnaireFieldType
  required: boolean
  clientTokenKey?: string
  placeholder?: string
  helpText?: string
  options?: string[]
}

export interface QuestionnaireTemplateDefinition {
  id: string
  name: string
  isDefault: boolean
  title: string
  description: string
  fields: QuestionnaireTemplateField[]
}

export interface QuestionnaireTemplateSettings {
  applyByDefaultWhenMissing: boolean
  templates: QuestionnaireTemplateDefinition[]
}

const FIELD_TYPES: QuestionnaireFieldType[] = [
  'single_line_text',
  'paragraph_text',
  'multiple_choice',
  'dropdown',
  'checkboxes',
  'radio_buttons',
  'email',
  'phone',
  'number',
  'date',
  'time',
]

const OPTION_BASED_TYPES: QuestionnaireFieldType[] = [
  'multiple_choice',
  'dropdown',
  'checkboxes',
  'radio_buttons',
]

const EMPTY_QUESTIONNAIRE_TEMPLATE_SETTINGS: QuestionnaireTemplateSettings = {
  applyByDefaultWhenMissing: true,
  templates: [
    {
      id: 'standard-booking-questionnaire',
      name: 'Standard Booking Questionnaire',
      isDefault: true,
      title: 'Booking Questionnaire',
      description: 'Collect essential planning details before production.',
      fields: [
        {
          id: 'client-names',
          label: 'Client Names',
          type: 'single_line_text',
          required: true,
          clientTokenKey: 'client_name',
          placeholder: 'First and last names',
        },
        {
          id: 'client-email',
          label: 'Client Email',
          type: 'email',
          required: true,
          clientTokenKey: 'client_email',
          placeholder: 'name@email.com',
        },
        {
          id: 'event-date',
          label: 'Event Date',
          type: 'date',
          required: true,
        },
        {
          id: 'coverage-type',
          label: 'Coverage Type',
          type: 'radio_buttons',
          required: true,
          options: ['Photography', 'Cinematography', 'Photo + Video'],
        },
      ],
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

function sanitizeFieldType(value: unknown, fallback: QuestionnaireFieldType): QuestionnaireFieldType {
  return FIELD_TYPES.includes(value as QuestionnaireFieldType)
    ? (value as QuestionnaireFieldType)
    : fallback
}

function sanitizeTokenKey(value: unknown) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return text
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeField(payload: unknown, index: number): QuestionnaireTemplateField {
  const fallback = {
    id: `field-${index + 1}`,
    label: `Question ${index + 1}`,
    type: 'single_line_text' as QuestionnaireFieldType,
    required: false,
    clientTokenKey: '',
    placeholder: '',
    helpText: '',
    options: [],
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fallback
  }

  const source = payload as Record<string, unknown>
  const type = sanitizeFieldType(source.type, fallback.type)
  const rawOptions = Array.isArray(source.options)
    ? source.options.filter((option): option is string => typeof option === 'string').map((option) => option.trim()).filter(Boolean)
    : []

  return {
    id: sanitizeText(source.id, fallback.id),
    label: sanitizeText(source.label, fallback.label),
    type,
    required: sanitizeBoolean(source.required, false),
    clientTokenKey: sanitizeTokenKey(source.clientTokenKey),
    placeholder: typeof source.placeholder === 'string' ? source.placeholder.trim() : '',
    helpText: typeof source.helpText === 'string' ? source.helpText.trim() : '',
    options: OPTION_BASED_TYPES.includes(type)
      ? (rawOptions.length ? rawOptions : ['Option 1'])
      : [],
  }
}

function normalizeTemplate(payload: unknown, index: number): QuestionnaireTemplateDefinition {
  const fallbackTemplate = EMPTY_QUESTIONNAIRE_TEMPLATE_SETTINGS.templates[0]

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ...fallbackTemplate,
      id: `${fallbackTemplate.id}-${index + 1}`,
      name: index === 0 ? fallbackTemplate.name : `Template ${index + 1}`,
      isDefault: index === 0,
    }
  }

  const source = payload as Record<string, unknown>
  const fields = Array.isArray(source.fields)
    ? source.fields.map((field, fieldIndex) => normalizeField(field, fieldIndex))
    : []

  return {
    id: sanitizeText(source.id, `questionnaire-template-${index + 1}`),
    name: sanitizeText(source.name, `Template ${index + 1}`),
    isDefault: sanitizeBoolean(source.isDefault, index === 0),
    title: sanitizeText(source.title, 'Questionnaire'),
    description: typeof source.description === 'string' ? source.description.trim() : '',
    fields: fields.length ? fields : fallbackTemplate.fields,
  }
}

function ensureDefaultTemplate(templates: QuestionnaireTemplateDefinition[]): QuestionnaireTemplateDefinition[] {
  if (!templates.length) return [...EMPTY_QUESTIONNAIRE_TEMPLATE_SETTINGS.templates]

  const firstDefaultIndex = templates.findIndex((template) => template.isDefault)
  const defaultIndex = firstDefaultIndex >= 0 ? firstDefaultIndex : 0

  return templates.map((template, index) => ({
    ...template,
    isDefault: index === defaultIndex,
  }))
}

function normalizeQuestionnaireTemplateSettings(payload: unknown): QuestionnaireTemplateSettings {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      applyByDefaultWhenMissing: EMPTY_QUESTIONNAIRE_TEMPLATE_SETTINGS.applyByDefaultWhenMissing,
      templates: [...EMPTY_QUESTIONNAIRE_TEMPLATE_SETTINGS.templates],
    }
  }

  const source = payload as Record<string, unknown>
  const templates = Array.isArray(source.templates)
    ? source.templates.map((template, index) => normalizeTemplate(template, index))
    : []

  return {
    applyByDefaultWhenMissing: sanitizeBoolean(
      source.applyByDefaultWhenMissing,
      EMPTY_QUESTIONNAIRE_TEMPLATE_SETTINGS.applyByDefaultWhenMissing,
    ),
    templates: ensureDefaultTemplate(templates),
  }
}

export async function fetchQuestionnaireTemplateSettings(brandSlug: BrandSlug): Promise<QuestionnaireTemplateSettings> {
  const brandId = await getBrandUuidFromSlug(brandSlug)
  return fetchQuestionnaireTemplateSettingsByBrandId(brandId)
}

export async function fetchQuestionnaireTemplateSettingsByBrandId(brandId: string): Promise<QuestionnaireTemplateSettings> {
  const { data, error } = await supabaseClient
    .from('brands')
    .select('settings')
    .eq('id', brandId)
    .maybeSingle()

  if (error) {
    throw error
  }

  const settings = parseSettings(data?.settings)
  return normalizeQuestionnaireTemplateSettings(settings.questionnaireTemplates)
}

export async function saveQuestionnaireTemplateSettings(
  brandSlug: BrandSlug,
  payload: QuestionnaireTemplateSettings,
): Promise<QuestionnaireTemplateSettings> {
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
  const nextQuestionnaireTemplates = normalizeQuestionnaireTemplateSettings(payload)

  const nextSettings: Json = {
    ...currentSettings,
    questionnaireTemplates: nextQuestionnaireTemplates as unknown as Json,
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

  return nextQuestionnaireTemplates
}
