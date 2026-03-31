import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'

export type LeadMessageChannel = 'email' | 'whatsapp' | 'instagram' | 'phone' | 'internal'
export type LeadMessageDirection = 'inbound' | 'outbound'

export interface LeadMessageRecord {
  id: string
  channel: LeadMessageChannel
  direction: LeadMessageDirection
  subject: string | null
  body: string
  occurredAt: string
  createdAt: string
}

export async function fetchLeadMessages(leadId: string): Promise<LeadMessageRecord[]> {
  const { data, error } = await supabaseClient
    .from('lead_messages')
    .select('id, channel, direction, subject, body, occurred_at, created_at')
    .eq('lead_id', leadId)
    .order('occurred_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    channel: row.channel,
    direction: row.direction,
    subject: row.subject,
    body: row.body,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  }))
}

interface CreateLeadMessageInput {
  leadId: string
  channel: LeadMessageChannel
  direction: LeadMessageDirection
  subject?: string
  body: string
  occurredAt?: string
  brandId?: string
  brandSlug?: BrandSlug
}

export async function createLeadMessage(input: CreateLeadMessageInput) {
  const normalizedBody = input.body.trim()
  if (!normalizedBody) throw new Error('Message body is required')

  let brandId = input.brandId
  if (!brandId && input.brandSlug) {
    brandId = await getBrandUuidFromSlug(input.brandSlug)
  }
  if (!brandId) throw new Error('Unable to resolve brand for message creation')

  const { error } = await supabaseClient
    .from('lead_messages')
    .insert({
      lead_id: input.leadId,
      brand_id: brandId,
      channel: input.channel,
      direction: input.direction,
      subject: input.subject?.trim() || null,
      body: normalizedBody,
      occurred_at: input.occurredAt || new Date().toISOString(),
    })

  if (error) throw error
}

export async function deleteLeadMessage(messageId: string) {
  const { error } = await supabaseClient
    .from('lead_messages')
    .delete()
    .eq('id', messageId)

  if (error) throw error
}
