import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'

export interface ContractSnapshot {
  id: string
  bodyHtml: string
  signaturePath: string | null
  variables: Record<string, string>
  updatedAt: string
  signedAt: string | null
  pdfUrl: string | null
}

interface ContractQueryOptions {
  eventId?: string
}

export async function fetchLatestContract(brandSlug: BrandSlug, options?: ContractQueryOptions): Promise<ContractSnapshot | null> {
  const brandUuid = await getBrandUuidFromSlug(brandSlug)

  let query = supabaseClient
    .from('contracts')
    .select('id, body_html, signature_img, variables, updated_at, signed_at, pdf_url, event_id')
    .eq('brand_id', brandUuid)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (options?.eventId) {
    query = query.eq('event_id', options.eventId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return {
    id: data.id,
    bodyHtml: data.body_html,
    signaturePath: data.signature_img,
    variables: (data.variables as Record<string, string>) ?? {},
    updatedAt: data.updated_at,
     signedAt: data.signed_at,
     pdfUrl: data.pdf_url,
  }
}

export async function saveContractDraft(contractId: string, bodyHtml: string) {
  const { error } = await supabaseClient
    .from('contracts')
    .update({ body_html: bodyHtml })
    .eq('id', contractId)

  if (error) {
    throw error
  }
}

export async function saveContractSignature(contractId: string, dataUrl: string) {
  const blob = dataUrlToBlob(dataUrl)
  const path = `contracts/${contractId}/signature-${Date.now()}.png`

  const { error: uploadError } = await supabaseClient.storage
    .from('contracts')
    .upload(path, blob, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'image/png',
    })

  if (uploadError) {
    throw uploadError
  }

  const { error: updateError } = await supabaseClient
    .from('contracts')
    .update({
      signature_img: path,
      signed_at: new Date().toISOString(),
    })
    .eq('id', contractId)

  if (updateError) {
    throw updateError
  }

  return path
}

function dataUrlToBlob(dataUrl: string) {
  const [meta, base64] = dataUrl.split(',')
  if (!base64) {
    throw new Error('Invalid signature data URL')
  }
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: meta?.includes('image/') ? meta.split(':')[1]?.split(';')[0] ?? 'image/png' : 'image/png' })
}
