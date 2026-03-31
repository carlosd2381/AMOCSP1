import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'

export type LeadTaskStatus = 'open' | 'in_progress' | 'done'

export interface LeadTaskRecord {
  id: string
  title: string
  details: string | null
  dueAt: string | null
  status: LeadTaskStatus
  sortOrder: number
  createdAt: string
}

export async function fetchLeadTasks(leadId: string): Promise<LeadTaskRecord[]> {
  const { data, error } = await supabaseClient
    .from('lead_tasks')
    .select('id, title, details, due_at, status, sort_order, created_at')
    .eq('lead_id', leadId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    details: item.details,
    dueAt: item.due_at,
    status: item.status,
    sortOrder: item.sort_order,
    createdAt: item.created_at,
  }))
}

interface CreateLeadTaskInput {
  leadId: string
  title: string
  details?: string
  dueAt?: string
  status?: LeadTaskStatus
  brandId?: string
  brandSlug?: BrandSlug
}

export async function createLeadTask(input: CreateLeadTaskInput) {
  const normalizedTitle = input.title.trim()
  if (!normalizedTitle) {
    throw new Error('Task title is required')
  }

  let brandId = input.brandId
  if (!brandId && input.brandSlug) {
    brandId = await getBrandUuidFromSlug(input.brandSlug)
  }

  if (!brandId) {
    throw new Error('Unable to resolve brand for task creation')
  }

  const { data, error } = await supabaseClient
    .from('lead_tasks')
    .insert({
      lead_id: input.leadId,
      brand_id: brandId,
      title: normalizedTitle,
      details: input.details?.trim() ? input.details.trim() : null,
      due_at: input.dueAt ? new Date(`${input.dueAt}T00:00:00`).toISOString() : null,
      status: input.status ?? 'open',
    })
    .select('id, title, details, due_at, status, sort_order, created_at')
    .single()

  if (error || !data) {
    throw error ?? new Error('Unable to create lead task')
  }

  return {
    id: data.id,
    title: data.title,
    details: data.details,
    dueAt: data.due_at,
    status: data.status,
    sortOrder: data.sort_order,
    createdAt: data.created_at,
  } satisfies LeadTaskRecord
}

export async function updateLeadTaskStatus(taskId: string, status: LeadTaskStatus) {
  const { error } = await supabaseClient
    .from('lead_tasks')
    .update({ status })
    .eq('id', taskId)

  if (error) {
    throw error
  }
}

interface UpdateLeadTaskInput {
  taskId: string
  title: string
  details?: string
  dueAt?: string
  status: LeadTaskStatus
}

export async function updateLeadTask(input: UpdateLeadTaskInput) {
  const normalizedTitle = input.title.trim()
  if (!normalizedTitle) {
    throw new Error('Task title is required')
  }

  const { error } = await supabaseClient
    .from('lead_tasks')
    .update({
      title: normalizedTitle,
      details: input.details?.trim() ? input.details.trim() : null,
      due_at: input.dueAt ? new Date(`${input.dueAt}T00:00:00`).toISOString() : null,
      status: input.status,
    })
    .eq('id', input.taskId)

  if (error) {
    throw error
  }
}

export async function deleteLeadTask(taskId: string) {
  const { error } = await supabaseClient
    .from('lead_tasks')
    .delete()
    .eq('id', taskId)

  if (error) {
    throw error
  }
}
