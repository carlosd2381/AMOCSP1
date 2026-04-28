import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'
import { createContractForEvent } from '@/services/leadDocumentsService'
import { fetchCompanyDetailsByBrandId } from '@/services/companyDetailsService'
import { formatEventDate, normalizeTokenValueMap, resolveTemplateTokens } from '@/services/templateTokenRenderingService'

export interface ContractAppliedTemplateMeta {
  templateId?: string
  templateName?: string
  templateTitle?: string
}

export interface ContractSnapshot {
  id: string
  bodyHtml: string
  signaturePath: string | null
  variables: Record<string, string | null>
  appliedTemplate?: ContractAppliedTemplateMeta
  updatedAt: string
  signedAt: string | null
  pdfUrl: string | null
}

interface ContractQueryOptions {
  eventId?: string
  contractId?: string
}

async function buildContractFallbackTokenValues(brandId: string, eventId?: string): Promise<Record<string, string>> {
  const fallback: Record<string, string> = {}

  const company = await fetchCompanyDetailsByBrandId(brandId)
  const brandName = company.displayName || company.legalBusinessName
  if (brandName) {
    fallback.brand = brandName
  }

  if (!eventId) {
    return fallback
  }

  const { data: eventRow, error: eventError } = await supabaseClient
    .from('events')
    .select('lead_id, start_time, location')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) throw eventError

  if (eventRow?.start_time) {
    fallback.event_date = formatEventDate(eventRow.start_time)
    fallback.event_time = new Date(eventRow.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  if (eventRow?.location && typeof eventRow.location === 'object' && !Array.isArray(eventRow.location)) {
    const address = (eventRow.location as Record<string, unknown>).address
    if (typeof address === 'string' && address.trim()) {
      fallback.event_location = address.trim()
    }
  }

  if (eventRow?.lead_id) {
    const { data: leadRow, error: leadError } = await supabaseClient
      .from('leads')
      .select('client_id')
      .eq('id', eventRow.lead_id)
      .maybeSingle()
    if (leadError) throw leadError

    const clientId = leadRow?.client_id
    if (clientId) {
      const { data: clientRow, error: clientError } = await supabaseClient
        .from('clients')
        .select('name')
        .eq('id', clientId)
        .maybeSingle()
      if (clientError) throw clientError
      if (clientRow?.name) {
        fallback.client_name = clientRow.name
      }
    }

    const { data: roleRows, error: roleError } = await supabaseClient
      .from('lead_contacts')
      .select('role, contact_id')
      .eq('lead_id', eventRow.lead_id)
      .in('role', ['bride', 'groom'])

    if (roleError) throw roleError

    const contactIds = (roleRows ?? []).map((row) => row.contact_id)
    if (contactIds.length) {
      const { data: contactRows, error: contactError } = await supabaseClient
        .from('address_book_contacts')
        .select('id, display_name, email, phone')
        .in('id', contactIds)

      if (contactError) throw contactError

      const contactsById = new Map((contactRows ?? []).map((row) => [row.id, row]))

      for (const row of roleRows ?? []) {
        if (row.role !== 'bride' && row.role !== 'groom') continue
        const contact = contactsById.get(row.contact_id)
        if (!contact) continue

        if (contact.display_name?.trim()) {
          fallback[`${row.role}.name`] = contact.display_name.trim()
          fallback[`${row.role}_name`] = contact.display_name.trim()
        }
        if (contact.email?.trim()) {
          fallback[`${row.role}.email`] = contact.email.trim()
          fallback[`${row.role}_email`] = contact.email.trim()
        }
        if (contact.phone?.trim()) {
          fallback[`${row.role}.phone`] = contact.phone.trim()
          fallback[`${row.role}_phone`] = contact.phone.trim()
        }
      }
    }
  }

  return fallback
}

function extractAppliedTemplateMeta(variables: Record<string, unknown> | null | undefined): ContractAppliedTemplateMeta | undefined {
  if (!variables) return undefined

  const templateId = typeof variables.selectedContractTemplateId === 'string'
    ? variables.selectedContractTemplateId.trim()
    : ''
  const templateName = typeof variables.contractTemplateName === 'string'
    ? variables.contractTemplateName.trim()
    : ''
  const templateTitle = typeof variables.contractTemplateTitle === 'string'
    ? variables.contractTemplateTitle.trim()
    : ''

  if (!templateId && !templateName && !templateTitle) {
    return undefined
  }

  return {
    ...(templateId ? { templateId } : {}),
    ...(templateName ? { templateName } : {}),
    ...(templateTitle ? { templateTitle } : {}),
  }
}

export async function fetchLatestContract(brandSlug: BrandSlug, options?: ContractQueryOptions): Promise<ContractSnapshot | null> {
  const brandUuid = await getBrandUuidFromSlug(brandSlug)

  let query = supabaseClient
    .from('contracts')
    .select('id, body_html, signature_img, variables, updated_at, signed_at, pdf_url, event_id, brand_id')
    .eq('brand_id', brandUuid)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (options?.eventId) {
    query = query.eq('event_id', options.eventId)
  }

  if (options?.contractId) {
    query = query.eq('id', options.contractId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    if (options?.eventId && !options?.contractId) {
      const createdId = await createContractForEvent({
        eventId: options.eventId,
        brandId: brandUuid,
      })

      const { data: createdRow, error: createdError } = await supabaseClient
        .from('contracts')
        .select('id, body_html, signature_img, variables, updated_at, signed_at, pdf_url, event_id, brand_id')
        .eq('id', createdId)
        .maybeSingle()

      if (createdError) {
        throw createdError
      }

      if (!createdRow) {
        return null
      }

      const fallbackTokens = await buildContractFallbackTokenValues(createdRow.brand_id, createdRow.event_id)
      const variableTokens = normalizeTokenValueMap((createdRow.variables as Record<string, unknown>) ?? {})

      return {
        id: createdRow.id,
        bodyHtml: resolveTemplateTokens(createdRow.body_html, { ...fallbackTokens, ...variableTokens }),
        signaturePath: createdRow.signature_img,
        variables: (createdRow.variables as Record<string, string | null>) ?? {},
        appliedTemplate: extractAppliedTemplateMeta((createdRow.variables as Record<string, unknown>) ?? {}),
        updatedAt: createdRow.updated_at,
        signedAt: createdRow.signed_at,
        pdfUrl: createdRow.pdf_url,
      }
    }

    return null
  }

  const fallbackTokens = await buildContractFallbackTokenValues(data.brand_id, data.event_id)
  const variableTokens = normalizeTokenValueMap((data.variables as Record<string, unknown>) ?? {})

  return {
    id: data.id,
    bodyHtml: resolveTemplateTokens(data.body_html, { ...fallbackTokens, ...variableTokens }),
    signaturePath: data.signature_img,
    variables: (data.variables as Record<string, string | null>) ?? {},
    appliedTemplate: extractAppliedTemplateMeta((data.variables as Record<string, unknown>) ?? {}),
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
