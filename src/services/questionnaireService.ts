import { supabaseClient } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'
import { type QuestionnaireTemplateDefinition } from '@/services/questionnaireTemplateSettingsService'

type QuestionnaireRow = Database['public']['Tables']['questionnaires']['Row']
type EventRow = Database['public']['Tables']['events']['Row']

type QuestionnaireAnswers = Partial<QuestionnaireFormValues>
type QuestionnaireAnswerValue = string | number | boolean | string[] | null

export interface QuestionnaireFormValues extends Record<string, QuestionnaireAnswerValue> {
  clientNames: string
  clientEmail: string
  plannerName: string
  plannerEmail: string
  plannerPhone: string
  eventTitle: string
  startDate: string
  startTime: string
  endTime: string
  ceremonyLocation: string
  receptionLocation: string
  guestCount: number | null
  notes: string
}

export interface QuestionnaireSnapshot {
  values: QuestionnaireFormValues
  status: QuestionnaireRow['status']
  submittedAt: string | null
}

interface QuestionnaireFetchOptions {
  clientFallback?: {
    name?: string
    email?: string
  }
}

export async function fetchQuestionnaire(eventId: string, options?: QuestionnaireFetchOptions): Promise<QuestionnaireSnapshot> {
  const [{ data: questionnaireRow, error: questionnaireError }, { data: eventRow, error: eventError }] = await Promise.all([
    supabaseClient
      .from('questionnaires')
      .select('id, answers, status, submitted_at')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<QuestionnaireRow>(),
    supabaseClient
      .from('events')
      .select('title, start_time, end_time, location')
      .eq('id', eventId)
      .maybeSingle<EventRow>(),
  ])

  if (questionnaireError) throw questionnaireError
  if (eventError) throw eventError

  const answers = (questionnaireRow?.answers as QuestionnaireAnswers | null) ?? null
  const location = (eventRow?.location as Record<string, string | undefined> | null) ?? null

  const startDateFromEvent = eventRow?.start_time ? eventRow.start_time.slice(0, 10) : ''
  const startTimeFromEvent = eventRow?.start_time ? eventRow.start_time.slice(11, 16) : ''
  const endTimeFromEvent = eventRow?.end_time ? eventRow.end_time.slice(11, 16) : ''

  const values: QuestionnaireFormValues = {
    ...(answers ?? {}),
    clientNames: answers?.clientNames ?? options?.clientFallback?.name ?? '',
    clientEmail: answers?.clientEmail ?? options?.clientFallback?.email ?? '',
    plannerName: answers?.plannerName ?? location?.plannerName ?? '',
    plannerEmail: answers?.plannerEmail ?? location?.plannerEmail ?? '',
    plannerPhone: answers?.plannerPhone ?? location?.plannerPhone ?? '',
    eventTitle: answers?.eventTitle ?? eventRow?.title ?? '',
    startDate: answers?.startDate ?? startDateFromEvent,
    startTime: answers?.startTime ?? startTimeFromEvent,
    endTime: answers?.endTime ?? endTimeFromEvent,
    ceremonyLocation: answers?.ceremonyLocation ?? location?.ceremonyAddress ?? '',
    receptionLocation: answers?.receptionLocation ?? location?.receptionAddress ?? '',
    guestCount: typeof answers?.guestCount === 'number' ? answers?.guestCount : null,
    notes: answers?.notes ?? location?.notes ?? '',
  }

  return {
    values,
    status: questionnaireRow?.status ?? 'draft',
    submittedAt: questionnaireRow?.submitted_at ?? null,
  }
}

interface SaveQuestionnaireParams {
  eventId: string
  brandSlug: BrandSlug
  leadId?: string
  template?: QuestionnaireTemplateDefinition
  payload: QuestionnaireFormValues
  submit?: boolean
}

export async function saveQuestionnaire({ eventId, brandSlug, leadId, template, payload, submit = false }: SaveQuestionnaireParams) {
  const brandUuid = await getBrandUuidFromSlug(brandSlug)
  const answers: QuestionnaireAnswers = { ...payload }
  const clientEmail = readString(payload.clientEmail)

  const { error: upsertError } = await supabaseClient
    .from('questionnaires')
    .upsert(
      {
        event_id: eventId,
        brand_id: brandUuid,
        client_email: clientEmail,
        answers,
        status: submit ? 'submitted' : 'draft',
        submitted_at: submit ? new Date().toISOString() : null,
      },
      { onConflict: 'event_id' },
    )

  if (upsertError) {
    throw upsertError
  }

  const { error: eventUpdateError } = await supabaseClient
    .from('events')
    .update({
      title: readString(payload.eventTitle),
      start_time: toIso(readString(payload.startDate), readString(payload.startTime)),
      end_time: toIso(readString(payload.startDate), readString(payload.endTime)),
      location: {
        ceremonyAddress: readString(payload.ceremonyLocation),
        receptionAddress: readString(payload.receptionLocation),
        plannerName: readString(payload.plannerName),
        plannerEmail: readString(payload.plannerEmail),
        plannerPhone: readString(payload.plannerPhone),
        notes: readString(payload.notes),
        guestCount: typeof payload.guestCount === 'number' && Number.isFinite(payload.guestCount) ? payload.guestCount : null,
      },
    })
    .eq('id', eventId)

  if (eventUpdateError) {
    throw eventUpdateError
  }

  if (leadId && template) {
    await applyQuestionnaireClientTokenMappings(leadId, eventId, template, payload)
  }

  if (submit && leadId) {
    await supabaseClient
      .from('leads')
      .update({ status: 'contract' })
      .eq('id', leadId)
  }
}

function toIso(date: string, time?: string) {
  if (!date) return null
  const normalizedTime = time && time.length ? time : '00:00'
  const iso = new Date(`${date}T${normalizedTime}`)
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString()
}

function readString(value: QuestionnaireAnswerValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

type ClientTokenKey = 'client_name' | 'client_email' | 'client_phone'
type ContactRole = 'bride' | 'groom'
type ContactField = 'name' | 'email' | 'phone'

function stringifyAnswerValue(value: QuestionnaireAnswerValue | undefined): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(', ')
  }
  return ''
}

function buildQuestionnaireTokenValueMap(
  template: QuestionnaireTemplateDefinition,
  payload: QuestionnaireFormValues,
): Record<string, string> {
  const tokenMap: Record<string, string> = {}

  for (const field of template.fields) {
    const tokenKey = (field.clientTokenKey ?? '').trim().toLowerCase()
    if (!tokenKey) continue

    const value = stringifyAnswerValue(payload[field.id])
    if (!value) continue

    tokenMap[tokenKey] = value
  }

  return tokenMap
}

async function applyQuestionnaireClientTokenMappings(
  leadId: string,
  eventId: string,
  template: QuestionnaireTemplateDefinition,
  payload: QuestionnaireFormValues,
) {
  const tokenMap = buildQuestionnaireTokenValueMap(template, payload)
  if (!Object.keys(tokenMap).length) {
    return
  }

  const { data: leadRow, error: leadError } = await supabaseClient
    .from('leads')
    .select('client_id, brand_id')
    .eq('id', leadId)
    .maybeSingle<{ client_id: string; brand_id: string }>()

  if (leadError) {
    throw leadError
  }

  if (!leadRow?.client_id) {
    return
  }

  const { data: clientRow, error: clientError } = await supabaseClient
    .from('clients')
    .select('id, name, email, phone, address')
    .eq('id', leadRow.client_id)
    .maybeSingle<Database['public']['Tables']['clients']['Row']>()

  if (clientError) {
    throw clientError
  }

  if (!clientRow) {
    return
  }

  const coreTokenKeys: ClientTokenKey[] = ['client_name', 'client_email', 'client_phone']
  const mappedMetadata = Object.entries(tokenMap).reduce<Record<string, string>>((acc, [key, value]) => {
    if (!coreTokenKeys.includes(key as ClientTokenKey)) {
      acc[key] = value
    }
    return acc
  }, {})

  const currentAddress = clientRow.address && typeof clientRow.address === 'object' && !Array.isArray(clientRow.address)
    ? clientRow.address as Record<string, unknown>
    : {}
  const currentQuestionnaireTokens = currentAddress.questionnaireTokens
    && typeof currentAddress.questionnaireTokens === 'object'
    && !Array.isArray(currentAddress.questionnaireTokens)
    ? currentAddress.questionnaireTokens as Record<string, string>
    : {}

  const nextAddress: Database['public']['Tables']['clients']['Update']['address'] = {
    ...currentAddress,
    questionnaireTokens: {
      ...currentQuestionnaireTokens,
      ...mappedMetadata,
    },
  }

  const nextName = tokenMap.client_name ?? clientRow.name
  const nextEmail = tokenMap.client_email ?? clientRow.email
  const nextPhone = typeof tokenMap.client_phone === 'string'
    ? (tokenMap.client_phone.trim() ? tokenMap.client_phone.trim() : null)
    : (clientRow.phone ?? null)

  const { error: updateClientError } = await supabaseClient
    .from('clients')
    .update({
      name: nextName,
      email: nextEmail,
      phone: nextPhone,
      address: nextAddress,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientRow.id)

  if (updateClientError) {
    throw updateClientError
  }

  await upsertRoleContactsFromTokenMap({
    leadId,
    brandId: leadRow.brand_id,
    eventId,
    tokenMap,
  })
}

function readRoleTokenValue(
  tokenMap: Record<string, string>,
  role: ContactRole,
  field: ContactField,
): string {
  return tokenMap[`${role}.${field}`] ?? tokenMap[`${role}_${field}`] ?? ''
}

async function upsertRoleContactsFromTokenMap(input: {
  leadId: string
  brandId: string
  eventId: string
  tokenMap: Record<string, string>
}) {
  const roles: ContactRole[] = ['bride', 'groom']

  const { data: existingRows, error: existingError } = await supabaseClient
    .from('lead_contacts')
    .select('id, role, contact_id, sort_order')
    .eq('lead_id', input.leadId)
    .in('role', roles)

  if (existingError) {
    throw existingError
  }

  const existingByRole = new Map<ContactRole, { id: string; contact_id: string; sort_order: number }>()
  const contactIds: string[] = []

  for (const row of (existingRows ?? []) as Array<{ id: string; role: ContactRole; contact_id: string; sort_order: number }>) {
    if (!existingByRole.has(row.role)) {
      existingByRole.set(row.role, { id: row.id, contact_id: row.contact_id, sort_order: row.sort_order })
      contactIds.push(row.contact_id)
    }
  }

  const contactsById = new Map<string, { id: string; display_name: string; email: string | null; phone: string | null }>()
  if (contactIds.length) {
    const { data: contactRows, error: contactError } = await supabaseClient
      .from('address_book_contacts')
      .select('id, display_name, email, phone')
      .in('id', contactIds)

    if (contactError) {
      throw contactError
    }

    for (const row of (contactRows ?? []) as Array<{ id: string; display_name: string; email: string | null; phone: string | null }>) {
      contactsById.set(row.id, row)
    }
  }

  const highestSortOrder = Math.max(0, ...((existingRows ?? []).map((row) => row.sort_order ?? 0)))
  let sortOrderCursor = highestSortOrder

  for (const role of roles) {
    const name = readRoleTokenValue(input.tokenMap, role, 'name')
    const email = readRoleTokenValue(input.tokenMap, role, 'email')
    const phone = readRoleTokenValue(input.tokenMap, role, 'phone')

    if (!name && !email && !phone) continue

    const existing = existingByRole.get(role)
    if (existing) {
      const contact = contactsById.get(existing.contact_id)
      const { error: updateContactError } = await supabaseClient
        .from('address_book_contacts')
        .update({
          display_name: name || contact?.display_name || (role === 'bride' ? 'Bride' : 'Groom'),
          email: email || contact?.email || null,
          phone: phone || contact?.phone || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.contact_id)

      if (updateContactError) {
        throw updateContactError
      }

      continue
    }

    const { data: newContact, error: createContactError } = await supabaseClient
      .from('address_book_contacts')
      .insert({
        brand_id: input.brandId,
        display_name: name || (role === 'bride' ? 'Bride' : 'Groom'),
        email: email || null,
        phone: phone || null,
      })
      .select('id')
      .single()

    if (createContactError || !newContact) {
      throw createContactError ?? new Error(`Unable to create ${role} contact`)
    }

    sortOrderCursor += 1
    const { error: createLinkError } = await supabaseClient
      .from('lead_contacts')
      .insert({
        lead_id: input.leadId,
        brand_id: input.brandId,
        event_id: input.eventId,
        contact_id: newContact.id,
        role,
        source: 'portal',
        sort_order: sortOrderCursor,
      })

    if (createLinkError) {
      throw createLinkError
    }
  }
}
