import { supabaseClient } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'

type ReviewRow = Database['public']['Tables']['reviews']['Row']

export interface ReviewFormValues extends Record<string, unknown> {
  ratingOverall: number
  ratingStaff: number
  ratingMedia: number
  comments: string
  testimonial: string
  clientEmail: string
}

export interface ReviewSnapshot {
  values: ReviewFormValues
  status: ReviewRow['status']
  submittedAt: string | null
}

export async function fetchReview(eventId: string, defaults?: { clientEmail?: string }): Promise<ReviewSnapshot> {
  const { data, error } = await supabaseClient
    .from('reviews')
    .select('id, status, submitted_at, rating_overall, rating_staff, rating_media, comments, testimonial, client_email')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle<ReviewRow>()

  if (error) {
    throw error
  }

  const values: ReviewFormValues = {
    ratingOverall: data?.rating_overall ?? 0,
    ratingStaff: data?.rating_staff ?? 0,
    ratingMedia: data?.rating_media ?? 0,
    comments: data?.comments ?? '',
    testimonial: data?.testimonial ?? '',
    clientEmail: data?.client_email ?? defaults?.clientEmail ?? '',
  }

  return {
    values,
    status: data?.status ?? 'draft',
    submittedAt: data?.submitted_at ?? null,
  }
}

interface SaveReviewParams {
  eventId: string
  brandSlug: BrandSlug
  payload: ReviewFormValues
}

export async function submitReview({ eventId, brandSlug, payload }: SaveReviewParams) {
  const brandUuid = await getBrandUuidFromSlug(brandSlug)

  const { error } = await supabaseClient
    .from('reviews')
    .upsert(
      {
        event_id: eventId,
        brand_id: brandUuid,
        client_email: payload.clientEmail,
        rating_overall: payload.ratingOverall,
        rating_staff: payload.ratingStaff,
        rating_media: payload.ratingMedia,
        comments: payload.comments,
        testimonial: payload.testimonial,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'event_id' },
    )

  if (error) {
    throw error
  }
}
