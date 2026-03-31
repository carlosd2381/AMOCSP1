import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'

export interface LeadEventOption {
  id: string
  title: string
  startTime: string | null
}

export interface LeadContractItem {
  id: string
  eventId: string
  eventTitle: string
  signedAt: string | null
  updatedAt: string
}

export interface LeadQuestionnaireItem {
  id: string
  eventId: string
  eventTitle: string
  status: 'draft' | 'submitted'
  submittedAt: string | null
  updatedAt: string
}

interface LeadEventsSnapshot {
  events: LeadEventOption[]
  eventMap: Map<string, LeadEventOption>
}

async function fetchLeadEvents(leadId: string): Promise<LeadEventsSnapshot> {
  const { data, error } = await supabaseClient
    .from('events')
    .select('id, title, start_time')
    .eq('lead_id', leadId)
    .order('start_time', { ascending: true })

  if (error) throw error

  const events = (data ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    startTime: event.start_time,
  }))

  return {
    events,
    eventMap: new Map(events.map((event) => [event.id, event])),
  }
}

export async function fetchLeadContracts(leadId: string): Promise<{ events: LeadEventOption[]; contracts: LeadContractItem[] }> {
  const { events, eventMap } = await fetchLeadEvents(leadId)
  const eventIds = events.map((event) => event.id)

  if (!eventIds.length) {
    return { events, contracts: [] }
  }

  const { data, error } = await supabaseClient
    .from('contracts')
    .select('id, event_id, signed_at, updated_at')
    .in('event_id', eventIds)
    .order('updated_at', { ascending: false })

  if (error) throw error

  const contracts: LeadContractItem[] = (data ?? []).map((contract) => ({
    id: contract.id,
    eventId: contract.event_id,
    eventTitle: eventMap.get(contract.event_id)?.title ?? 'Untitled event',
    signedAt: contract.signed_at,
    updatedAt: contract.updated_at,
  }))

  return { events, contracts }
}

interface CreateContractInput {
  eventId: string
  brandId?: string
  brandSlug?: BrandSlug
}

export async function createContractForEvent(input: CreateContractInput) {
  let brandId = input.brandId
  if (!brandId && input.brandSlug) {
    brandId = await getBrandUuidFromSlug(input.brandSlug)
  }
  if (!brandId) throw new Error('Unable to resolve brand for contract creation')

  const { data: existing, error: existingError } = await supabaseClient
    .from('contracts')
    .select('id')
    .eq('event_id', input.eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing?.id) return existing.id

  const { data, error } = await supabaseClient
    .from('contracts')
    .insert({
      event_id: input.eventId,
      brand_id: brandId,
      body_html: '<h2>Production Agreement</h2><p>Add contract clauses here.</p>',
      variables: {},
    })
    .select('id')
    .single()

  if (error || !data) throw error ?? new Error('Unable to create contract')
  return data.id
}

export async function fetchLeadQuestionnaires(leadId: string): Promise<{ events: LeadEventOption[]; questionnaires: LeadQuestionnaireItem[] }> {
  const { events, eventMap } = await fetchLeadEvents(leadId)
  const eventIds = events.map((event) => event.id)

  if (!eventIds.length) {
    return { events, questionnaires: [] }
  }

  const { data, error } = await supabaseClient
    .from('questionnaires')
    .select('id, event_id, status, submitted_at, updated_at')
    .in('event_id', eventIds)
    .order('updated_at', { ascending: false })

  if (error) throw error

  const questionnaires: LeadQuestionnaireItem[] = (data ?? []).map((item) => ({
    id: item.id,
    eventId: item.event_id,
    eventTitle: eventMap.get(item.event_id)?.title ?? 'Untitled event',
    status: item.status,
    submittedAt: item.submitted_at,
    updatedAt: item.updated_at,
  }))

  return { events, questionnaires }
}

interface CreateQuestionnaireDraftInput {
  eventId: string
  clientEmail: string
  brandId?: string
  brandSlug?: BrandSlug
}

export async function createQuestionnaireDraftForEvent(input: CreateQuestionnaireDraftInput) {
  let brandId = input.brandId
  if (!brandId && input.brandSlug) {
    brandId = await getBrandUuidFromSlug(input.brandSlug)
  }
  if (!brandId) throw new Error('Unable to resolve brand for questionnaire creation')

  const { error } = await supabaseClient
    .from('questionnaires')
    .upsert(
      {
        event_id: input.eventId,
        brand_id: brandId,
        client_email: input.clientEmail,
        answers: {},
        status: 'draft',
        submitted_at: null,
      },
      { onConflict: 'event_id' },
    )

  if (error) throw error
}
