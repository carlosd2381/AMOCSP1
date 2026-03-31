import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'

export interface LeadInternalNote {
  id: string
  body: string
  createdAt: string
  updatedAt: string
}

export async function fetchLeadInternalNotes(leadId: string): Promise<LeadInternalNote[]> {
  const { data, error } = await supabaseClient
    .from('lead_internal_notes')
    .select('id, body, created_at, updated_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((item) => ({
    id: item.id,
    body: item.body,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }))
}

interface CreateLeadInternalNoteInput {
  leadId: string
  body: string
  brandId?: string
  brandSlug?: BrandSlug
}

export async function createLeadInternalNote(input: CreateLeadInternalNoteInput) {
  const normalizedBody = input.body.trim()
  if (!normalizedBody) {
    throw new Error('Note body is required')
  }

  let brandId = input.brandId
  if (!brandId && input.brandSlug) {
    brandId = await getBrandUuidFromSlug(input.brandSlug)
  }

  if (!brandId) {
    throw new Error('Unable to resolve brand for note creation')
  }

  const { data, error } = await supabaseClient
    .from('lead_internal_notes')
    .insert({
      lead_id: input.leadId,
      brand_id: brandId,
      body: normalizedBody,
    })
    .select('id, body, created_at, updated_at')
    .single()

  if (error || !data) {
    throw error ?? new Error('Unable to create internal note')
  }

  return {
    id: data.id,
    body: data.body,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  } satisfies LeadInternalNote
}

interface UpdateLeadInternalNoteInput {
  noteId: string
  body: string
}

export async function updateLeadInternalNote(input: UpdateLeadInternalNoteInput) {
  const normalizedBody = input.body.trim()
  if (!normalizedBody) {
    throw new Error('Note body is required')
  }

  const { error } = await supabaseClient
    .from('lead_internal_notes')
    .update({ body: normalizedBody })
    .eq('id', input.noteId)

  if (error) {
    throw error
  }
}

export async function deleteLeadInternalNote(noteId: string) {
  const { error } = await supabaseClient
    .from('lead_internal_notes')
    .delete()
    .eq('id', noteId)

  if (error) {
    throw error
  }
}
