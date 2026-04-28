import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import type { Database } from '@/lib/database.types'
import { supabaseClient } from '@/lib/supabase'
import { type BrandSlug } from '@/types'

export type LeadVenueStatus =
  | 'shortlisted'
  | 'reserved'
  | 'contracted'
  | 'coordinator_pending'
  | 'coordinator_assigned'

export type LeadVenueLocationKind = 'ceremony' | 'reception' | 'bridal_session' | 'other'

export interface VenueProfileValues {
  name: string
  resortGroup?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  stateProvince?: string
  postalCode?: string
  country?: string
  phone?: string
  email?: string
  website?: string
  notes?: string
}

export interface VenueProfileSummary {
  id: string
  name: string
  resortGroup?: string
  city?: string
  country?: string
  updatedAt: string
}

export interface LeadVenueAssignmentRecord {
  assignmentId: string
  leadId: string
  brandId: string
  locationKind: LeadVenueLocationKind
  locationLabel?: string
  sortOrder: number
  status: LeadVenueStatus
  reservedOn?: string
  coordinatorEtaWeeks?: number
  coordinatorAssignedOn?: string
  notes?: string
  venueProfileId: string
  venue: VenueProfileValues & {
    id: string
    createdAt: string
    updatedAt: string
  }
}

export interface VenueProfileRecord extends VenueProfileValues {
  id: string
  brandId: string
  createdAt: string
  updatedAt: string
}

export type VenueTeamRole = 'planner' | 'coordinator'

export interface VenueTeamContactOption {
  id: string
  displayName: string
  email?: string
  phone?: string
  company?: string
  jobTitle?: string
}

export interface VenueTeamContactRecord extends VenueTeamContactOption {
  venueTeamContactId: string
  venueProfileId: string
  role: VenueTeamRole
  sortOrder: number
  notes?: string
}

export interface VenueAssignedClientRecord {
  leadId: string
  leadStatus: Database['public']['Tables']['leads']['Row']['status']
  eventDate?: string
  assignmentStatus: LeadVenueStatus
  clientId: string
  clientName: string
  clientEmail: string
  clientPhone?: string
  assignmentUpdatedAt: string
}

export interface VenueAssignmentStatSummary {
  venueProfileId: string
  totalClients: number
  statusCounts: Record<LeadVenueStatus, number>
}

export type VenueAssignmentStatsByProfile = Record<string, VenueAssignmentStatSummary>

interface UpsertLeadVenueInput {
  assignmentId?: string
  leadId: string
  brandId?: string
  brandSlug?: BrandSlug
  locationKind?: LeadVenueLocationKind
  locationLabel?: string
  sortOrder?: number
  venueProfileId?: string
  forceCreateVenueProfile?: boolean
  status?: LeadVenueStatus
  reservedOn?: string
  coordinatorEtaWeeks?: number
  coordinatorAssignedOn?: string
  notes?: string
  venue: VenueProfileValues
}

interface LeadVenueAssignmentRow {
  id: string
  lead_id: string
  brand_id: string
  venue_profile_id: string
  location_kind: LeadVenueLocationKind
  location_label: string | null
  sort_order: number
  status: LeadVenueStatus
  reserved_on: string | null
  coordinator_eta_weeks: number | null
  coordinator_assigned_on: string | null
  notes: string | null
}

interface VenueProfileRow {
  id: string
  name: string
  resort_group: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state_province: string | null
  postal_code: string | null
  country: string | null
  phone: string | null
  email: string | null
  website: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface VenueTeamContactRow {
  id: string
  venue_profile_id: string
  contact_id: string
  role: VenueTeamRole
  sort_order: number
  notes: string | null
}

interface AddressBookContactSummaryRow {
  id: string
  display_name: string
  email: string | null
  phone: string | null
  company: string | null
  job_title: string | null
}

interface LeadVenueAssignmentListRow {
  lead_id: string
  status: LeadVenueStatus
  updated_at: string
}

type LeadRow = Database['public']['Tables']['leads']['Row']
type ClientRow = Database['public']['Tables']['clients']['Row']

interface LeadWithClientRow extends LeadRow {
  clients: ClientRow | null
}

export async function fetchVenueProfiles(input: { brandId?: string; brandSlug?: BrandSlug }): Promise<VenueProfileSummary[]> {
  const brandId = input.brandId ?? (input.brandSlug ? await getBrandUuidFromSlug(input.brandSlug) : undefined)
  if (!brandId) return []

  const { data, error } = await supabaseClient
    .from('venue_profiles')
    .select('id, name, resort_group, city, country, updated_at')
    .eq('brand_id', brandId)
    .order('name', { ascending: true })

  if (error) {
    if (isMissingRelationError(error)) {
      return []
    }
    throw error
  }

  return (data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    resortGroup: item.resort_group ?? undefined,
    city: item.city ?? undefined,
    country: item.country ?? undefined,
    updatedAt: item.updated_at,
  }))
}

export async function fetchVenueAssignmentStatsByProfile(input: {
  brandId?: string
  brandSlug?: BrandSlug
}): Promise<VenueAssignmentStatsByProfile> {
  const brandId = input.brandId ?? (input.brandSlug ? await getBrandUuidFromSlug(input.brandSlug) : undefined)
  if (!brandId) return {}

  const { data, error } = await supabaseClient
    .from('lead_venue_assignments')
    .select('venue_profile_id, status')
    .eq('brand_id', brandId)

  if (error) {
    if (isMissingRelationError(error)) {
      return {}
    }
    throw error
  }

  const stats: VenueAssignmentStatsByProfile = {}

  for (const row of data ?? []) {
    const venueProfileId = row.venue_profile_id
    if (!stats[venueProfileId]) {
      stats[venueProfileId] = {
        venueProfileId,
        totalClients: 0,
        statusCounts: {
          shortlisted: 0,
          reserved: 0,
          contracted: 0,
          coordinator_pending: 0,
          coordinator_assigned: 0,
        },
      }
    }

    stats[venueProfileId].totalClients += 1
    stats[venueProfileId].statusCounts[row.status as LeadVenueStatus] += 1
  }

  return stats
}

export async function createVenueProfile(input: { brandId?: string; brandSlug?: BrandSlug; venue: VenueProfileValues }) {
  const brandId = input.brandId ?? (input.brandSlug ? await getBrandUuidFromSlug(input.brandSlug) : undefined)
  if (!brandId) {
    throw new Error('Unable to resolve brand for venue profile')
  }

  const { data, error } = await supabaseClient
    .from('venue_profiles')
    .insert({
      brand_id: brandId,
      ...toVenueProfilePayload(input.venue),
    })
    .select('id, name, resort_group, city, country, updated_at')
    .single()

  if (error || !data) {
    if (isMissingRelationError(error)) {
      throw new Error('Venue tables are not installed yet. Run supabase/schema.sql and then retry.')
    }
    throw error ?? new Error('Unable to create venue profile')
  }

  return {
    id: data.id,
    name: data.name,
    resortGroup: data.resort_group ?? undefined,
    city: data.city ?? undefined,
    country: data.country ?? undefined,
    updatedAt: data.updated_at,
  } as VenueProfileSummary
}

export async function updateVenueProfile(input: { venueProfileId: string; venue: VenueProfileValues }): Promise<VenueProfileRecord> {
  const { error } = await supabaseClient
    .from('venue_profiles')
    .update(toVenueProfilePayload(input.venue))
    .eq('id', input.venueProfileId)

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error('Venue tables are not installed yet. Run supabase/schema.sql and then retry.')
    }
    throw error
  }

  const refreshed = await fetchVenueProfileById(input.venueProfileId)
  if (!refreshed) {
    throw new Error('Unable to refresh venue profile after save')
  }

  return refreshed
}

export async function deleteVenueProfile(venueProfileId: string) {
  const { error } = await supabaseClient
    .from('venue_profiles')
    .delete()
    .eq('id', venueProfileId)

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error('Venue tables are not installed yet. Run supabase/schema.sql and then retry.')
    }
    throw error
  }
}

export async function fetchVenueProfileById(venueProfileId: string): Promise<VenueProfileRecord | null> {
  const { data, error } = await supabaseClient
    .from('venue_profiles')
    .select(
      'id, brand_id, name, resort_group, address_line1, address_line2, city, state_province, postal_code, country, phone, email, website, notes, created_at, updated_at',
    )
    .eq('id', venueProfileId)
    .maybeSingle()

  if (error) {
    if (isMissingRelationError(error)) {
      return null
    }
    throw error
  }

  if (!data) {
    return null
  }

  return {
    id: data.id,
    brandId: data.brand_id,
    name: data.name,
    resortGroup: data.resort_group ?? undefined,
    addressLine1: data.address_line1 ?? undefined,
    addressLine2: data.address_line2 ?? undefined,
    city: data.city ?? undefined,
    stateProvince: data.state_province ?? undefined,
    postalCode: data.postal_code ?? undefined,
    country: data.country ?? undefined,
    phone: data.phone ?? undefined,
    email: data.email ?? undefined,
    website: data.website ?? undefined,
    notes: data.notes ?? undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function fetchVenueTeamContactOptions(input: { brandId?: string; brandSlug?: BrandSlug }): Promise<VenueTeamContactOption[]> {
  const brandId = input.brandId ?? (input.brandSlug ? await getBrandUuidFromSlug(input.brandSlug) : undefined)
  if (!brandId) return []

  const { data, error } = await supabaseClient
    .from('address_book_contacts')
    .select('id, display_name, email, phone, company, job_title')
    .eq('brand_id', brandId)
    .order('display_name', { ascending: true })

  if (error) throw error

  return ((data ?? []) as AddressBookContactSummaryRow[]).map((item) => ({
    id: item.id,
    displayName: item.display_name,
    email: item.email ?? undefined,
    phone: item.phone ?? undefined,
    company: item.company ?? undefined,
    jobTitle: item.job_title ?? undefined,
  }))
}

export async function fetchVenueTeamContacts(venueProfileId: string): Promise<VenueTeamContactRecord[]> {
  const { data, error } = await supabaseClient
    .from('venue_team_contacts')
    .select('id, venue_profile_id, contact_id, role, sort_order, notes')
    .eq('venue_profile_id', venueProfileId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingRelationError(error)) {
      return []
    }
    throw error
  }

  const rows = (data ?? []) as VenueTeamContactRow[]
  if (!rows.length) return []

  const contactIds = rows.map((row) => row.contact_id)

  const { data: contactsData, error: contactsError } = await supabaseClient
    .from('address_book_contacts')
    .select('id, display_name, email, phone, company, job_title')
    .in('id', contactIds)

  if (contactsError) throw contactsError

  const contactsById = new Map(
    ((contactsData ?? []) as AddressBookContactSummaryRow[]).map((contact) => [contact.id, contact] as const),
  )

  return rows
    .map((row) => {
      const contact = contactsById.get(row.contact_id)
      if (!contact) return null
      return {
        venueTeamContactId: row.id,
        venueProfileId: row.venue_profile_id,
        id: contact.id,
        displayName: contact.display_name,
        email: contact.email ?? undefined,
        phone: contact.phone ?? undefined,
        company: contact.company ?? undefined,
        jobTitle: contact.job_title ?? undefined,
        role: row.role,
        sortOrder: row.sort_order,
        notes: row.notes ?? undefined,
      } as VenueTeamContactRecord
    })
    .filter((item): item is VenueTeamContactRecord => Boolean(item))
}

export async function addVenueTeamContact(input: {
  venueProfileId: string
  contactId: string
  role: VenueTeamRole
  sortOrder?: number
  notes?: string
}) {
  const { error } = await supabaseClient
    .from('venue_team_contacts')
    .upsert(
      {
        venue_profile_id: input.venueProfileId,
        contact_id: input.contactId,
        role: input.role,
        sort_order: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
        notes: normalizeText(input.notes),
      },
      { onConflict: 'venue_profile_id,contact_id,role' },
    )

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error('Venue team table is not installed yet. Run supabase/schema.sql and then retry.')
    }
    throw error
  }
}

export async function removeVenueTeamContact(venueTeamContactId: string) {
  const { error } = await supabaseClient
    .from('venue_team_contacts')
    .delete()
    .eq('id', venueTeamContactId)

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error('Venue team table is not installed yet. Run supabase/schema.sql and then retry.')
    }
    throw error
  }
}

export async function fetchVenueAssignedClients(venueProfileId: string): Promise<VenueAssignedClientRecord[]> {
  const { data: assignmentsData, error: assignmentsError } = await supabaseClient
    .from('lead_venue_assignments')
    .select('lead_id, status, updated_at')
    .eq('venue_profile_id', venueProfileId)
    .order('updated_at', { ascending: false })

  if (assignmentsError) {
    if (isMissingRelationError(assignmentsError)) {
      return []
    }
    throw assignmentsError
  }

  const assignments = (assignmentsData ?? []) as LeadVenueAssignmentListRow[]
  if (!assignments.length) return []

  const assignmentByLeadId = new Map(assignments.map((item) => [item.lead_id, item] as const))
  const leadIds = assignments.map((item) => item.lead_id)

  const { data: leadsData, error: leadsError } = await supabaseClient
    .from('leads')
    .select('id, status, event_date, client_id, clients:client_id (id, name, email, phone, type, brand_id)')
    .in('id', leadIds)
    .returns<LeadWithClientRow[]>()

  if (leadsError || !leadsData) {
    throw leadsError ?? new Error('Unable to load lead assignments for venue')
  }

  return leadsData
    .map((lead) => {
      const assignment = assignmentByLeadId.get(lead.id)
      const client = lead.clients
      if (!assignment || !client) return null

      return {
        leadId: lead.id,
        leadStatus: lead.status,
        eventDate: lead.event_date ?? undefined,
        assignmentStatus: assignment.status,
        clientId: client.id,
        clientName: client.name,
        clientEmail: client.email,
        clientPhone: client.phone ?? undefined,
        assignmentUpdatedAt: assignment.updated_at,
      } as VenueAssignedClientRecord
    })
    .filter((item): item is VenueAssignedClientRecord => Boolean(item))
}

export async function fetchLeadVenueAssignments(leadId: string): Promise<LeadVenueAssignmentRecord[]> {
  const { data, error } = await supabaseClient
    .from('lead_venue_assignments')
    .select('id, lead_id, brand_id, venue_profile_id, location_kind, location_label, sort_order, status, reserved_on, coordinator_eta_weeks, coordinator_assigned_on, notes')
    .eq('lead_id', leadId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingRelationError(error)) {
      return []
    }
    throw error
  }

  const assignments = (data ?? []) as LeadVenueAssignmentRow[]
  if (!assignments.length) return []

  const venueIds = [...new Set(assignments.map((item) => item.venue_profile_id))]
  const { data: venueData, error: venueError } = await supabaseClient
    .from('venue_profiles')
    .select('id, name, resort_group, address_line1, address_line2, city, state_province, postal_code, country, phone, email, website, notes, created_at, updated_at')
    .in('id', venueIds)

  if (venueError) {
    if (isMissingRelationError(venueError)) {
      return []
    }
    throw venueError
  }

  const venueById = new Map(((venueData ?? []) as VenueProfileRow[]).map((venue) => [venue.id, venue] as const))

  return assignments
    .map((assignment) => {
      const venue = venueById.get(assignment.venue_profile_id)
      if (!venue) return null
      return mapRowsToRecord(assignment, venue)
    })
    .filter((item): item is LeadVenueAssignmentRecord => Boolean(item))
}

export async function fetchLeadVenueAssignment(leadId: string): Promise<LeadVenueAssignmentRecord | null> {
  const assignments = await fetchLeadVenueAssignments(leadId)
  if (!assignments.length) return null
  return assignments.find((item) => item.locationKind === 'reception') ?? assignments[0]
}

export async function saveLeadVenueAssignment(input: UpsertLeadVenueInput) {
  const brandId = input.brandId ?? (input.brandSlug ? await getBrandUuidFromSlug(input.brandSlug) : undefined)
  if (!brandId) {
    throw new Error('Unable to resolve brand for venue assignment')
  }

  const normalizedAssignmentId = input.assignmentId?.trim() || undefined
  let existingAssignment: {
    id: string
    venue_profile_id: string
    location_kind: LeadVenueLocationKind
    sort_order: number
    status: LeadVenueStatus
  } | null = null

  if (normalizedAssignmentId) {
    const { data, error: existingAssignmentError } = await supabaseClient
      .from('lead_venue_assignments')
      .select('id, venue_profile_id, location_kind, sort_order, status')
      .eq('id', normalizedAssignmentId)
      .maybeSingle()

    if (existingAssignmentError) {
      if (isMissingRelationError(existingAssignmentError)) {
        throw new Error('Venue tables are not installed yet. Run supabase/schema.sql and then retry.')
      }
      throw existingAssignmentError
    }

    existingAssignment = data
  }

  const selectedVenueProfileId = input.venueProfileId?.trim() || undefined
  const forceCreateVenueProfile = Boolean(input.forceCreateVenueProfile)

  let venueProfileId = existingAssignment?.venue_profile_id
  if (!forceCreateVenueProfile && existingAssignment?.venue_profile_id && (!selectedVenueProfileId || selectedVenueProfileId === existingAssignment.venue_profile_id)) {
    const { error: updateVenueError } = await supabaseClient
      .from('venue_profiles')
      .update(toVenueProfilePayload(input.venue))
      .eq('id', existingAssignment.venue_profile_id)

    if (updateVenueError) throw updateVenueError
  } else if (!forceCreateVenueProfile && selectedVenueProfileId) {
    venueProfileId = selectedVenueProfileId
  } else {
    const { data: createdVenue, error: createVenueError } = await supabaseClient
      .from('venue_profiles')
      .insert({
        brand_id: brandId,
        ...toVenueProfilePayload(input.venue),
      })
      .select('id')
      .single()

    if (createVenueError || !createdVenue) {
      throw createVenueError ?? new Error('Unable to create venue profile')
    }

    venueProfileId = createdVenue.id
  }

  if (!venueProfileId) {
    throw new Error('Unable to resolve venue profile for assignment')
  }

  const assignmentPayload = {
    brand_id: brandId,
    venue_profile_id: venueProfileId,
    location_kind: input.locationKind ?? existingAssignment?.location_kind ?? 'reception',
    location_label: normalizeText(input.locationLabel),
    sort_order: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : Number(existingAssignment?.sort_order ?? 0),
    status: input.status ?? existingAssignment?.status ?? 'shortlisted',
    reserved_on: normalizeDate(input.reservedOn),
    coordinator_eta_weeks: Number.isFinite(input.coordinatorEtaWeeks) ? Number(input.coordinatorEtaWeeks) : null,
    coordinator_assigned_on: normalizeDate(input.coordinatorAssignedOn),
    notes: normalizeText(input.notes),
  }

  let assignmentId = existingAssignment?.id

  if (assignmentId) {
    const { error: updateAssignmentError } = await supabaseClient
      .from('lead_venue_assignments')
      .update(assignmentPayload)
      .eq('id', assignmentId)

    if (updateAssignmentError) throw updateAssignmentError
  } else {
    const { data: inserted, error: createAssignmentError } = await supabaseClient
      .from('lead_venue_assignments')
      .insert({
        lead_id: input.leadId,
        ...assignmentPayload,
      })
      .select('id')
      .single()

    if (createAssignmentError || !inserted) throw createAssignmentError ?? new Error('Unable to create venue assignment')
    assignmentId = inserted.id
  }

  const refreshed = await fetchLeadVenueAssignments(input.leadId)
  const selected = refreshed.find((item) => item.assignmentId === assignmentId)
  if (!selected) throw new Error('Unable to refresh venue assignment after save')

  return selected
}

export async function upsertLeadVenueAssignment(input: UpsertLeadVenueInput) {
  return saveLeadVenueAssignment(input)
}

export async function deleteLeadVenueAssignment(assignmentId: string) {
  const { error } = await supabaseClient
    .from('lead_venue_assignments')
    .delete()
    .eq('id', assignmentId)

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error('Venue tables are not installed yet. Run supabase/schema.sql and then retry.')
    }
    throw error
  }
}

function toVenueProfilePayload(venue: VenueProfileValues) {
  return {
    name: normalizeText(venue.name) ?? 'Unnamed Venue',
    resort_group: normalizeText(venue.resortGroup),
    address_line1: normalizeText(venue.addressLine1),
    address_line2: normalizeText(venue.addressLine2),
    city: normalizeText(venue.city),
    state_province: normalizeText(venue.stateProvince),
    postal_code: normalizeText(venue.postalCode),
    country: normalizeText(venue.country),
    phone: normalizeText(venue.phone),
    email: normalizeText(venue.email),
    website: normalizeText(venue.website),
    notes: normalizeText(venue.notes),
  }
}

function mapRowsToRecord(assignment: LeadVenueAssignmentRow, venue: VenueProfileRow): LeadVenueAssignmentRecord {
  return {
    assignmentId: assignment.id,
    leadId: assignment.lead_id,
    brandId: assignment.brand_id,
    locationKind: assignment.location_kind,
    locationLabel: assignment.location_label ?? undefined,
    sortOrder: assignment.sort_order,
    venueProfileId: assignment.venue_profile_id,
    status: assignment.status,
    reservedOn: assignment.reserved_on ?? undefined,
    coordinatorEtaWeeks: assignment.coordinator_eta_weeks ?? undefined,
    coordinatorAssignedOn: assignment.coordinator_assigned_on ?? undefined,
    notes: assignment.notes ?? undefined,
    venue: {
      id: venue.id,
      name: venue.name,
      resortGroup: venue.resort_group ?? undefined,
      addressLine1: venue.address_line1 ?? undefined,
      addressLine2: venue.address_line2 ?? undefined,
      city: venue.city ?? undefined,
      stateProvince: venue.state_province ?? undefined,
      postalCode: venue.postal_code ?? undefined,
      country: venue.country ?? undefined,
      phone: venue.phone ?? undefined,
      email: venue.email ?? undefined,
      website: venue.website ?? undefined,
      notes: venue.notes ?? undefined,
      createdAt: venue.created_at,
      updatedAt: venue.updated_at,
    },
  }
}

function normalizeText(value?: string) {
  const next = value?.trim()
  return next ? next : null
}

function normalizeDate(value?: string) {
  const next = value?.trim()
  return next ? next : null
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string; message?: string }
  return candidate.code === '42P01' || Boolean(candidate.message?.toLowerCase().includes('does not exist'))
}
