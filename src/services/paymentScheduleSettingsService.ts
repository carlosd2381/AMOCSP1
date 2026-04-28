import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type Json } from '@/lib/database.types'
import { supabaseClient } from '@/lib/supabase'
import { type BrandSlug } from '@/types'

export interface PaymentScheduleTemplateEntry {
  id: string
  label: string
  percentage: number
  dueRule: PaymentScheduleDueRule
  dueOffsetDays: number
}

export interface PaymentScheduleDefinition {
  id: string
  name: string
  isDefault: boolean
  templates: PaymentScheduleTemplateEntry[]
}

export type PaymentScheduleDueRule =
  | 'on_acceptance'
  | 'on_delivery'
  | 'after_order_booked'
  | 'before_job_date'
  | 'on_job_date'
  | 'after_job_date'

export interface PaymentScheduleSettings {
  applyByDefaultWhenMissing: boolean
  schedules: PaymentScheduleDefinition[]
}

const EMPTY_PAYMENT_SCHEDULE_SETTINGS: PaymentScheduleSettings = {
  applyByDefaultWhenMissing: false,
  schedules: [
    {
      id: 'standard',
      name: 'Standard',
      isDefault: true,
      templates: [
        { id: 'deposit', label: 'Deposit', percentage: 50, dueRule: 'on_acceptance', dueOffsetDays: 0 },
        { id: 'final', label: 'Final Payment', percentage: 50, dueRule: 'before_job_date', dueOffsetDays: 7 },
      ],
    },
  ],
}

const DUE_RULES: PaymentScheduleDueRule[] = [
  'on_acceptance',
  'on_delivery',
  'after_order_booked',
  'before_job_date',
  'on_job_date',
  'after_job_date',
]

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
  if (typeof value === 'boolean') return value
  return fallback
}

function sanitizePercent(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, Number(value.toFixed(4))))
}

function sanitizeDays(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(365, Math.round(value)))
}

function sanitizeDueRule(value: unknown, fallback: PaymentScheduleDueRule): PaymentScheduleDueRule {
  return DUE_RULES.includes(value as PaymentScheduleDueRule)
    ? (value as PaymentScheduleDueRule)
    : fallback
}

function normalizeTemplateEntry(payload: unknown, index: number): PaymentScheduleTemplateEntry {
  const defaultTemplates = EMPTY_PAYMENT_SCHEDULE_SETTINGS.schedules[0]?.templates ?? []

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const fallback = defaultTemplates[Math.min(index, defaultTemplates.length - 1)]
    return {
      ...fallback,
      id: `${fallback.id}-${index + 1}`,
    }
  }

  const source = payload as Record<string, unknown>
  const fallback = defaultTemplates[Math.min(index, defaultTemplates.length - 1)]

  return {
    id: sanitizeText(source.id, `template-${index + 1}`),
    label: sanitizeText(source.label, fallback.label),
    percentage: sanitizePercent(source.percentage, fallback.percentage),
    dueRule: sanitizeDueRule(source.dueRule, fallback.dueRule),
    dueOffsetDays: sanitizeDays(source.dueOffsetDays ?? source.dueDaysOffset, fallback.dueOffsetDays),
  }
}

function normalizeScheduleDefinition(payload: unknown, index: number): PaymentScheduleDefinition {
  const defaultSchedule = EMPTY_PAYMENT_SCHEDULE_SETTINGS.schedules[0]

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      id: `${defaultSchedule.id}-${index + 1}`,
      name: index === 0 ? defaultSchedule.name : `Schedule ${index + 1}`,
      isDefault: index === 0,
      templates: defaultSchedule.templates.map((entry, templateIndex) => ({
        ...entry,
        id: `${entry.id}-${index + 1}-${templateIndex + 1}`,
      })),
    }
  }

  const source = payload as Record<string, unknown>
  const templateRows = Array.isArray(source.templates)
    ? source.templates
      .map((entry, templateIndex) => normalizeTemplateEntry(entry, templateIndex))
      .filter((entry) => entry.percentage > 0)
    : []

  return {
    id: sanitizeText(source.id, `schedule-${index + 1}`),
    name: sanitizeText(source.name, `Schedule ${index + 1}`),
    isDefault: sanitizeBoolean(source.isDefault, index === 0),
    templates: templateRows.length
      ? templateRows
      : defaultSchedule.templates.map((entry, templateIndex) => ({
        ...entry,
        id: `${entry.id}-${index + 1}-${templateIndex + 1}`,
      })),
  }
}

function ensureDefaultSchedule(schedules: PaymentScheduleDefinition[]): PaymentScheduleDefinition[] {
  if (!schedules.length) {
    return [...EMPTY_PAYMENT_SCHEDULE_SETTINGS.schedules]
  }

  const firstDefaultIndex = schedules.findIndex((schedule) => schedule.isDefault)
  const defaultIndex = firstDefaultIndex >= 0 ? firstDefaultIndex : 0

  return schedules.map((schedule, index) => ({
    ...schedule,
    isDefault: index === defaultIndex,
  }))
}

function normalizePaymentScheduleSettings(payload: unknown): PaymentScheduleSettings {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      applyByDefaultWhenMissing: EMPTY_PAYMENT_SCHEDULE_SETTINGS.applyByDefaultWhenMissing,
      schedules: [...EMPTY_PAYMENT_SCHEDULE_SETTINGS.schedules],
    }
  }

  const source = payload as Record<string, unknown>

  const schedules = Array.isArray(source.schedules)
    ? source.schedules.map((schedule, index) => normalizeScheduleDefinition(schedule, index))
    : []

  if (!schedules.length && Array.isArray(source.templates)) {
    const legacyTemplateRows = source.templates
      .map((entry, index) => normalizeTemplateEntry(entry, index))
      .filter((entry) => entry.percentage > 0)

    schedules.push({
      id: 'standard',
      name: 'Standard',
      isDefault: true,
      templates: legacyTemplateRows.length
        ? legacyTemplateRows
        : [...(EMPTY_PAYMENT_SCHEDULE_SETTINGS.schedules[0]?.templates ?? [])],
    })
  }

  const normalizedSchedules = ensureDefaultSchedule(schedules)

  return {
    applyByDefaultWhenMissing: typeof source.applyByDefaultWhenMissing === 'boolean'
      ? source.applyByDefaultWhenMissing
      : EMPTY_PAYMENT_SCHEDULE_SETTINGS.applyByDefaultWhenMissing,
    schedules: normalizedSchedules.length
      ? normalizedSchedules
      : [...EMPTY_PAYMENT_SCHEDULE_SETTINGS.schedules],
  }
}

export async function fetchPaymentScheduleSettings(brandSlug: BrandSlug): Promise<PaymentScheduleSettings> {
  const brandId = await getBrandUuidFromSlug(brandSlug)
  return fetchPaymentScheduleSettingsByBrandId(brandId)
}

export async function fetchPaymentScheduleSettingsByBrandId(brandId: string): Promise<PaymentScheduleSettings> {
  const { data, error } = await supabaseClient
    .from('brands')
    .select('settings')
    .eq('id', brandId)
    .maybeSingle()

  if (error) {
    throw error
  }

  const settings = parseSettings(data?.settings)
  return normalizePaymentScheduleSettings(settings.paymentSchedules)
}

export async function savePaymentScheduleSettings(
  brandSlug: BrandSlug,
  payload: PaymentScheduleSettings,
): Promise<PaymentScheduleSettings> {
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
  const nextPaymentSchedules = normalizePaymentScheduleSettings(payload)

  const nextSettings: Json = {
    ...currentSettings,
    paymentSchedules: nextPaymentSchedules as unknown as Json,
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

  return nextPaymentSchedules
}
