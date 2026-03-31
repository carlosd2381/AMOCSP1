import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'

export type LeadFileCategory = 'contracts' | 'timelines' | 'shot_lists'

export interface LeadFileRecord {
  id: string
  category: LeadFileCategory
  title: string
  fileUrl: string
  notes: string | null
  createdAt: string
}

export async function fetchLeadFiles(leadId: string): Promise<LeadFileRecord[]> {
  const { data, error } = await supabaseClient
    .from('lead_files')
    .select('id, category, title, file_url, notes, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    fileUrl: row.file_url,
    notes: row.notes,
    createdAt: row.created_at,
  }))
}

interface CreateLeadFileInput {
  leadId: string
  category: LeadFileCategory
  title: string
  fileUrl: string
  notes?: string
  brandId?: string
  brandSlug?: BrandSlug
}

export async function createLeadFile(input: CreateLeadFileInput) {
  const title = input.title.trim()
  const fileUrl = input.fileUrl.trim()

  if (!title) throw new Error('File title is required')
  if (!fileUrl) throw new Error('File URL is required')

  let brandId = input.brandId
  if (!brandId && input.brandSlug) {
    brandId = await getBrandUuidFromSlug(input.brandSlug)
  }
  if (!brandId) throw new Error('Unable to resolve brand for file creation')

  const { error } = await supabaseClient
    .from('lead_files')
    .insert({
      lead_id: input.leadId,
      brand_id: brandId,
      category: input.category,
      title,
      file_url: fileUrl,
      notes: input.notes?.trim() || null,
    })

  if (error) throw error
}

export async function deleteLeadFile(fileId: string) {
  const { error } = await supabaseClient
    .from('lead_files')
    .delete()
    .eq('id', fileId)

  if (error) throw error
}
