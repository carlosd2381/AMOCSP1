import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'

export type LeadScheduleShootType = 'photo' | 'video' | 'drone' | 'hybrid'

export interface LeadScheduleItem {
  id: string
  title: string
  date: string
  startTime: string
  endTime: string
  shootType: LeadScheduleShootType
  startAt: string
  endAt: string
}

export async function fetchLeadSchedule(leadId: string): Promise<LeadScheduleItem[]> {
  const { data, error } = await supabaseClient
    .from('events')
    .select('id, title, start_time, end_time, shoot_type')
    .eq('lead_id', leadId)
    .order('start_time', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? [])
    .filter((row) => row.start_time && row.end_time)
    .map((row) => {
      const startDate = new Date(row.start_time as string)
      const endDate = new Date(row.end_time as string)
      return {
        id: row.id,
        title: row.title,
        date: toDateInput(startDate),
        startTime: toTimeInput(startDate),
        endTime: toTimeInput(endDate),
        shootType: row.shoot_type,
        startAt: row.start_time as string,
        endAt: row.end_time as string,
      }
    })
}

interface CreateLeadScheduleInput {
  leadId: string
  brandId?: string
  brandSlug?: BrandSlug
  title: string
  date: string
  startTime: string
  endTime: string
  shootType: LeadScheduleShootType
}

export async function createLeadScheduleItem(input: CreateLeadScheduleInput) {
  const title = input.title.trim()
  if (!title) {
    throw new Error('Event title is required')
  }

  let brandId = input.brandId
  if (!brandId && input.brandSlug) {
    brandId = await getBrandUuidFromSlug(input.brandSlug)
  }

  if (!brandId) {
    throw new Error('Unable to resolve brand for schedule item')
  }

  const startAt = toIso(input.date, input.startTime)
  const endAt = toIso(input.date, input.endTime)

  if (!startAt || !endAt) {
    throw new Error('Invalid date/time values')
  }

  const { data, error } = await supabaseClient
    .from('events')
    .insert({
      lead_id: input.leadId,
      brand_id: brandId,
      title,
      start_time: startAt,
      end_time: endAt,
      shoot_type: input.shootType,
      location: {},
    })
    .select('id, title, start_time, end_time, shoot_type')
    .single()

  if (error || !data) {
    throw error ?? new Error('Unable to create schedule item')
  }

  const startDate = new Date(data.start_time as string)
  const endDate = new Date(data.end_time as string)

  return {
    id: data.id,
    title: data.title,
    date: toDateInput(startDate),
    startTime: toTimeInput(startDate),
    endTime: toTimeInput(endDate),
    shootType: data.shoot_type,
    startAt: data.start_time as string,
    endAt: data.end_time as string,
  } satisfies LeadScheduleItem
}

interface UpdateLeadScheduleInput {
  eventId: string
  title: string
  date: string
  startTime: string
  endTime: string
  shootType: LeadScheduleShootType
}

export async function updateLeadScheduleItem(input: UpdateLeadScheduleInput) {
  const title = input.title.trim()
  if (!title) {
    throw new Error('Event title is required')
  }

  const startAt = toIso(input.date, input.startTime)
  const endAt = toIso(input.date, input.endTime)

  if (!startAt || !endAt) {
    throw new Error('Invalid date/time values')
  }

  const { error } = await supabaseClient
    .from('events')
    .update({
      title,
      start_time: startAt,
      end_time: endAt,
      shoot_type: input.shootType,
    })
    .eq('id', input.eventId)

  if (error) {
    throw error
  }
}

export async function deleteLeadScheduleItem(eventId: string) {
  const { error } = await supabaseClient
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) {
    throw error
  }
}

function toIso(date: string, time: string) {
  const value = new Date(`${date}T${time}`)
  if (Number.isNaN(value.getTime())) return null
  return value.toISOString()
}

function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10)
}

function toTimeInput(value: Date) {
  return value.toISOString().slice(11, 16)
}
