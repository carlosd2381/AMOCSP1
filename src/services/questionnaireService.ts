import { supabaseClient } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'

type QuestionnaireRow = Database['public']['Tables']['questionnaires']['Row']
type EventRow = Database['public']['Tables']['events']['Row']

type QuestionnaireAnswers = Partial<QuestionnaireFormValues>
type QuestionnaireAnswerValue = string | number | boolean | null

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
  payload: QuestionnaireFormValues
  submit?: boolean
}

export async function saveQuestionnaire({ eventId, brandSlug, leadId, payload, submit = false }: SaveQuestionnaireParams) {
  const brandUuid = await getBrandUuidFromSlug(brandSlug)
  const answers: QuestionnaireAnswers = { ...payload }

  const { error: upsertError } = await supabaseClient
    .from('questionnaires')
    .upsert(
      {
        event_id: eventId,
        brand_id: brandUuid,
        client_email: payload.clientEmail,
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
      title: payload.eventTitle,
      start_time: toIso(payload.startDate, payload.startTime),
      end_time: toIso(payload.startDate, payload.endTime),
      location: {
        ceremonyAddress: payload.ceremonyLocation,
        receptionAddress: payload.receptionLocation,
        plannerName: payload.plannerName,
        plannerEmail: payload.plannerEmail,
        plannerPhone: payload.plannerPhone,
        notes: payload.notes,
        guestCount: payload.guestCount,
      },
    })
    .eq('id', eventId)

  if (eventUpdateError) {
    throw eventUpdateError
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
