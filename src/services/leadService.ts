import { supabaseClient } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { getBrandSlugFromUuid, getBrandUuidFromSlug } from '@/lib/brandRegistry'
import {
  DEFAULT_CLIENT_MARKET_PROFILE,
  type BrandSlug,
  type ClientLanguage,
  type ClientMarketProfile,
  type ClientMarketType,
  type LeadRecord,
  type LeadStatus,
  type PricingCatalogKey,
} from '@/types'
import { ensureAddressBookContactForLeadClient } from '@/services/addressBookService'

type LeadRow = Database['public']['Tables']['leads']['Row']
type ClientRow = Database['public']['Tables']['clients']['Row']
type PublicTableName = keyof Database['public']['Tables']

interface LeadRowWithClient extends LeadRow {
  clients: ClientRow | null
}

interface MarketProfileAddressPayload {
  market?: {
    clientType?: ClientMarketType
    preferredLanguage?: ClientLanguage
    preferredCurrency?: 'USD' | 'MXN'
    preferredCatalog?: PricingCatalogKey
  }
}

export interface LeadDeletionImpact {
  events: number
  proposals: number
  contracts: number
  invoices: number
  questionnaires: number
  galleries: number
  files: number
  messages: number
  tasks: number
  internalNotes: number
  payables: number
  contacts: number
  venueAssignments: number
  totalRelatedRecords: number
}

interface LeadVenueAssignmentLookupRow {
  lead_id: string
  venue_profile_id: string
  location_kind: 'ceremony' | 'reception' | 'bridal_session' | 'other' | null
}

interface VenueProfileNameRow {
  id: string
  name: string
}

function createEmptyLeadBoard(): Record<LeadStatus, LeadRecord[]> {
  return {
    new: [],
    contacted: [],
    proposal: [],
    contract: [],
    booked: [],
    lost: [],
  }
}

export function createLeadBoardSkeleton() {
  return createEmptyLeadBoard()
}

export async function fetchLeadBoard(brandSlug?: BrandSlug) {
  let query = supabaseClient
    .from('leads')
    .select(
      `id, status, event_date, inquiry_notes, source, brand_id, clients:client_id (
        id, name, email, phone, type, brand_id, address
      )`,
    )
    .order('updated_at', { ascending: false })

  if (brandSlug) {
    const brandUuid = await getBrandUuidFromSlug(brandSlug)
    query = query.eq('brand_id', brandUuid)
  }

  const { data, error } = await query.returns<LeadRowWithClient[]>()

  if (error || !data) {
    throw error ?? new Error('Unable to load leads')
  }

  const grouped = createEmptyLeadBoard()

  const leadIds = data.map((row) => row.id)
  let venueByLeadId = new Map<string, string>()

  if (leadIds.length) {
    const { data: assignmentsData, error: assignmentsError } = await supabaseClient
      .from('lead_venue_assignments')
      .select('lead_id, venue_profile_id, location_kind')
      .in('lead_id', leadIds)

    if (!assignmentsError && assignmentsData?.length) {
      const assignments = assignmentsData as LeadVenueAssignmentLookupRow[]
      const uniqueVenueIds = [...new Set(assignments.map((item) => item.venue_profile_id))]

      if (uniqueVenueIds.length) {
        const { data: venuesData, error: venuesError } = await supabaseClient
          .from('venue_profiles')
          .select('id, name')
          .in('id', uniqueVenueIds)

        if (!venuesError && venuesData?.length) {
          const venueNameById = new Map((venuesData as VenueProfileNameRow[]).map((item) => [item.id, item.name] as const))
          const preferredByLead = new Map<string, LeadVenueAssignmentLookupRow>()
          for (const assignment of assignments) {
            const current = preferredByLead.get(assignment.lead_id)
            if (!current) {
              preferredByLead.set(assignment.lead_id, assignment)
              continue
            }
            if (assignment.location_kind === 'reception' && current.location_kind !== 'reception') {
              preferredByLead.set(assignment.lead_id, assignment)
            }
          }

          venueByLeadId = new Map(
            [...preferredByLead.entries()].map(([leadId, assignment]) => [leadId, venueNameById.get(assignment.venue_profile_id) ?? ''] as const),
          )
        }
      }
    }
  }

  await Promise.all(
    data.map(async (row) => {
      const client = row.clients
      const brandSlugForClient = await getBrandSlugFromUuid(client?.brand_id)

      const record: LeadRecord = {
        id: row.id,
        status: row.status,
        venueName: venueByLeadId.get(row.id) || undefined,
        eventDate: row.event_date ?? '',
        source: row.source ?? undefined,
        notes: row.inquiry_notes ?? undefined,
        client: {
          id: client?.id ?? 'unknown-client',
          name: client?.name ?? 'Unknown client',
          email: client?.email ?? 'unknown@amo.mx',
          phone: client?.phone ?? undefined,
          brandId: client?.brand_id ?? undefined,
          brandSlug: brandSlugForClient,
          type: client?.type ?? 'couple',
          marketProfile: resolveClientMarketProfile(client?.address),
        },
      }

      grouped[row.status] = [...grouped[row.status], record]
    }),
  )

  return grouped
}

export async function fetchLeadById(leadId: string) {
  const { data, error } = await supabaseClient
    .from('leads')
    .select(
      `id, status, event_date, inquiry_notes, source, brand_id, clients:client_id (
        id, name, email, phone, type, brand_id, address
      )`,
    )
    .eq('id', leadId)
    .maybeSingle()
    .returns<LeadRowWithClient>()

  if (error || !data) {
    throw error ?? new Error('Lead not found')
  }

  const client = data.clients
  const brandSlugForClient = await getBrandSlugFromUuid(client?.brand_id)

  let venueName: string | undefined
  const { data: assignmentData, error: assignmentError } = await supabaseClient
    .from('lead_venue_assignments')
    .select('venue_profile_id, location_kind')
    .eq('lead_id', data.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (!assignmentError && assignmentData?.length) {
    const assignments = assignmentData as LeadVenueAssignmentLookupRow[]
    const preferred = assignments.find((item) => item.location_kind === 'reception') ?? assignments[0]

    const { data: venueData, error: venueError } = await supabaseClient
      .from('venue_profiles')
      .select('name')
      .eq('id', preferred.venue_profile_id)
      .maybeSingle()

    if (!venueError && venueData?.name) {
      venueName = venueData.name
    }
  }

  const record: LeadRecord = {
    id: data.id,
    status: data.status,
    venueName,
    eventDate: data.event_date ?? '',
    source: data.source ?? undefined,
    notes: data.inquiry_notes ?? undefined,
    client: {
      id: client?.id ?? 'unknown-client',
      name: client?.name ?? 'Unknown client',
      email: client?.email ?? 'unknown@amo.mx',
      phone: client?.phone ?? undefined,
      brandId: client?.brand_id ?? undefined,
      brandSlug: brandSlugForClient,
      type: client?.type ?? 'couple',
      marketProfile: resolveClientMarketProfile(client?.address),
    },
  }

  return record
}

export interface CreateLeadInput {
  client: {
    name: string
    email: string
    phone?: string
    type: 'couple' | 'corporate'
    marketProfile?: Partial<ClientMarketProfile>
  }
  eventDate?: string
  notes?: string
  source?: string
  brandSlug: BrandSlug
}

export async function createLead(payload: CreateLeadInput) {
  const brandUuid = await getBrandUuidFromSlug(payload.brandSlug)

  const { data: clientRow, error: clientError } = await supabaseClient
    .from('clients')
    .insert({
      brand_id: brandUuid,
      name: payload.client.name,
      email: payload.client.email,
      phone: payload.client.phone ?? null,
      type: payload.client.type,
      address: buildClientAddressMarketPayload(payload.client.marketProfile),
    })
    .select()
    .single()

  if (clientError || !clientRow) {
    throw clientError ?? new Error('Unable to create client')
  }

  const { data: leadRow, error: leadError } = await supabaseClient
    .from('leads')
    .insert({
      client_id: clientRow.id,
      brand_id: brandUuid,
      status: 'new',
      event_date: payload.eventDate ?? null,
      inquiry_notes: payload.notes ?? null,
      source: payload.source ?? null,
    })
    .select('id, status, event_date, inquiry_notes, source')
    .single()

  if (leadError || !leadRow) {
    throw leadError ?? new Error('Unable to create lead')
  }

  await ensureAddressBookContactForLeadClient({
    brandSlug: payload.brandSlug,
    name: clientRow.name,
    email: clientRow.email,
    phone: clientRow.phone ?? undefined,
  })

  const record: LeadRecord = {
    id: leadRow.id,
    status: leadRow.status,
    venueName: undefined,
    eventDate: leadRow.event_date ?? '',
    source: leadRow.source ?? undefined,
    notes: leadRow.inquiry_notes ?? undefined,
    client: {
      id: clientRow.id,
      name: clientRow.name,
      email: clientRow.email,
      phone: clientRow.phone ?? undefined,
      brandId: clientRow.brand_id,
      brandSlug: payload.brandSlug,
      type: clientRow.type,
      marketProfile: resolveClientMarketProfile(clientRow.address),
    },
  }

  return record
}

interface UpdateLeadStatusInput {
  leadId: string
  toStatus: LeadStatus
}

export async function updateLeadStatus({ leadId, toStatus }: UpdateLeadStatusInput) {
  const { error } = await supabaseClient
    .from('leads')
    .update({ status: toStatus })
    .eq('id', leadId)

  if (error) {
    throw error
  }
}

export interface UpdateLeadProfileInput {
  leadId: string
  clientId: string
  name: string
  email: string
  phone?: string
  type: 'couple' | 'corporate'
  marketProfile?: Partial<ClientMarketProfile>
  eventDate?: string
  source?: string
  notes?: string
  status: LeadStatus
}

export async function updateLeadProfile(payload: UpdateLeadProfileInput) {
  const { data: clientRow, error: clientError } = await supabaseClient
    .from('clients')
    .update({
      name: payload.name,
      email: payload.email,
      phone: payload.phone?.trim() ? payload.phone.trim() : null,
      type: payload.type,
      address: buildClientAddressMarketPayload(payload.marketProfile),
    })
    .eq('id', payload.clientId)
    .select('id, name, email, phone, type, brand_id, address')
    .single()

  if (clientError || !clientRow) {
    throw clientError ?? new Error('Unable to update client profile')
  }

  const { data: leadRow, error: leadError } = await supabaseClient
    .from('leads')
    .update({
      status: payload.status,
      event_date: payload.eventDate?.trim() ? payload.eventDate : null,
      inquiry_notes: payload.notes?.trim() ? payload.notes.trim() : null,
      source: payload.source?.trim() ? payload.source.trim() : null,
    })
    .eq('id', payload.leadId)
    .select('id, status, event_date, inquiry_notes, source')
    .single()

  if (leadError || !leadRow) {
    throw leadError ?? new Error('Unable to update lead profile')
  }

  const brandSlug = await getBrandSlugFromUuid(clientRow.brand_id)

  const updated: LeadRecord = {
    id: leadRow.id,
    status: leadRow.status,
    venueName: undefined,
    eventDate: leadRow.event_date ?? '',
    source: leadRow.source ?? undefined,
    notes: leadRow.inquiry_notes ?? undefined,
    client: {
      id: clientRow.id,
      name: clientRow.name,
      email: clientRow.email,
      phone: clientRow.phone ?? undefined,
      brandId: clientRow.brand_id,
      brandSlug,
      type: clientRow.type,
      marketProfile: resolveClientMarketProfile(clientRow.address),
    },
  }

  return updated
}

function buildClientAddressMarketPayload(profile?: Partial<ClientMarketProfile>): Database['public']['Tables']['clients']['Insert']['address'] {
  const normalized = normalizeClientMarketProfile(profile)
  return {
    market: {
      clientType: normalized.clientType,
      preferredLanguage: normalized.preferredLanguage,
      preferredCurrency: normalized.preferredCurrency,
      preferredCatalog: normalized.preferredCatalog,
    },
  }
}

function resolveClientMarketProfile(address: ClientRow['address'] | undefined): ClientMarketProfile {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return DEFAULT_CLIENT_MARKET_PROFILE
  }

  const payload = address as MarketProfileAddressPayload
  return normalizeClientMarketProfile(payload.market)
}

function normalizeClientMarketProfile(profile?: Partial<ClientMarketProfile>): ClientMarketProfile {
  const clientType = profile?.clientType === 'MEX' ? 'MEX' : 'INT'
  const preferredLanguage = profile?.preferredLanguage === 'es'
    ? 'es'
    : (clientType === 'MEX' ? 'es' : 'en')
  const preferredCurrency = profile?.preferredCurrency === 'MXN'
    ? 'MXN'
    : (clientType === 'MEX' ? 'MXN' : 'USD')
  const preferredCatalog: PricingCatalogKey = profile?.preferredCatalog === 'MEX_MXN_ESP'
    ? 'MEX_MXN_ESP'
    : (clientType === 'MEX' ? 'MEX_MXN_ESP' : 'INT_USD_ENG')

  return {
    clientType,
    preferredLanguage,
    preferredCurrency,
    preferredCatalog,
  }
}

export async function fetchLeadDeletionImpact(leadId: string): Promise<LeadDeletionImpact> {
  const { data: eventRows, error: eventError } = await supabaseClient
    .from('events')
    .select('id')
    .eq('lead_id', leadId)

  if (eventError && !isMissingRelationError(eventError)) {
    throw eventError
  }

  const eventIds = (eventRows ?? []).map((item) => item.id)

  const [
    proposals,
    files,
    messages,
    tasks,
    internalNotes,
    payables,
    contacts,
    venueAssignments,
    contracts,
    invoices,
    questionnaires,
    galleries,
  ] = await Promise.all([
    safeCountByEq('proposals', 'lead_id', leadId),
    safeCountByEq('lead_files', 'lead_id', leadId),
    safeCountByEq('lead_messages', 'lead_id', leadId),
    safeCountByEq('lead_tasks', 'lead_id', leadId),
    safeCountByEq('lead_internal_notes', 'lead_id', leadId),
    safeCountByEq('lead_payables', 'lead_id', leadId),
    safeCountByEq('lead_contacts', 'lead_id', leadId),
    safeCountByEq('lead_venue_assignments', 'lead_id', leadId),
    safeCountByIn('contracts', 'event_id', eventIds),
    safeCountByIn('invoices', 'event_id', eventIds),
    safeCountByIn('questionnaires', 'event_id', eventIds),
    safeCountByIn('galleries', 'event_id', eventIds),
  ])

  const impact: LeadDeletionImpact = {
    events: eventIds.length,
    proposals,
    contracts,
    invoices,
    questionnaires,
    galleries,
    files,
    messages,
    tasks,
    internalNotes,
    payables,
    contacts,
    venueAssignments,
    totalRelatedRecords:
      eventIds.length +
      proposals +
      contracts +
      invoices +
      questionnaires +
      galleries +
      files +
      messages +
      tasks +
      internalNotes +
      payables +
      contacts +
      venueAssignments,
  }

  return impact
}

export async function deleteLead(leadId: string) {
  const { error } = await supabaseClient
    .from('leads')
    .delete()
    .eq('id', leadId)

  if (error) {
    throw error
  }
}

async function safeCountByEq(table: PublicTableName, column: string, value: string) {
  const { count, error } = await supabaseClient
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value)

  if (error) {
    if (isMissingRelationError(error)) return 0
    throw error
  }

  return count ?? 0
}

async function safeCountByIn(table: PublicTableName, column: string, values: string[]) {
  if (!values.length) return 0

  const { count, error } = await supabaseClient
    .from(table)
    .select('*', { count: 'exact', head: true })
    .in(column, values)

  if (error) {
    if (isMissingRelationError(error)) return 0
    throw error
  }

  return count ?? 0
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string; message?: string }
  return candidate.code === '42P01' || Boolean(candidate.message?.toLowerCase().includes('does not exist'))
}
