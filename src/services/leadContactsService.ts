import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type LeadRecord, type BrandSlug } from '@/types'

export type LeadContactRole =
  | 'bride'
  | 'groom'
  | 'parent'
  | 'venue_coordinator'
  | 'wedding_planner'
  | 'vendor'
  | 'other'

export interface LeadContactRecord {
  id: string
  addressBookContactId?: string
  eventId?: string
  eventTitle?: string
  role: LeadContactRole | 'primary_client' | 'planner'
  name: string
  email?: string
  phone?: string
  notes?: string
  sortOrder?: number
  source: 'lead' | 'address_book' | 'legacy_planner' | 'legacy_event'
}

interface LeadContactRow {
  id: string
  lead_id: string
  event_id: string | null
  contact_id: string
  role: LeadContactRecord['role']
  source: 'manual' | 'import' | 'portal'
  sort_order: number
  notes: string | null
}

interface AddressBookContactRow {
  id: string
  display_name: string
  email: string | null
  phone: string | null
}

interface EventTitleRow {
  id: string
  title: string
}

interface EventLocationRow {
  id: string
  title: string
  location: unknown
}

interface LegacyEventLocationContact {
  id?: string
  name?: string
  role?: unknown
  email?: string
  phone?: string
  notes?: string
}

export async function fetchLeadContacts(lead: LeadRecord): Promise<LeadContactRecord[]> {
  let primaryAddressBookContactId: string | undefined
  if (lead.client.brandId && lead.client.email?.trim()) {
    const { data: primaryRow, error: primaryError } = await supabaseClient
      .from('address_book_contacts')
      .select('id')
      .eq('brand_id', lead.client.brandId)
      .ilike('email', lead.client.email.trim())
      .maybeSingle()

    if (primaryError) throw primaryError
    primaryAddressBookContactId = primaryRow?.id
  }

  const { data, error } = await supabaseClient
    .from('lead_contacts')
    .select('id, lead_id, event_id, contact_id, role, source, sort_order, notes')
    .eq('lead_id', lead.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error

  const contacts: LeadContactRecord[] = [
    {
      id: `client:${lead.client.id}`,
      addressBookContactId: primaryAddressBookContactId,
      role: 'primary_client',
      name: lead.client.name,
      email: lead.client.email,
      phone: lead.client.phone,
      source: 'lead',
    },
  ]

  const rows = (data ?? []) as LeadContactRow[]
  const contactIds = rows.map((row) => row.contact_id)
  const eventIds = rows.map((row) => row.event_id).filter((value): value is string => Boolean(value))

  const contactsMap = new Map<string, AddressBookContactRow>()
  if (contactIds.length) {
    const { data: contacts, error: contactsError } = await supabaseClient
      .from('address_book_contacts')
      .select('id, display_name, email, phone')
      .in('id', contactIds)

    if (contactsError) throw contactsError
    for (const item of (contacts ?? []) as AddressBookContactRow[]) {
      contactsMap.set(item.id, item)
    }
  }

  const eventsMap = new Map<string, EventTitleRow>()
  if (eventIds.length) {
    const { data: events, error: eventsError } = await supabaseClient
      .from('events')
      .select('id, title')
      .in('id', eventIds)

    if (eventsError) throw eventsError
    for (const item of (events ?? []) as EventTitleRow[]) {
      eventsMap.set(item.id, item)
    }
  }

  const { data: legacyEvents, error: legacyEventsError } = await supabaseClient
    .from('events')
    .select('id, title, location')
    .eq('lead_id', lead.id)

  if (legacyEventsError) throw legacyEventsError

  for (const row of rows) {
    const contact = contactsMap.get(row.contact_id)
    if (!contact) continue

    contacts.push({
      id: row.id,
      addressBookContactId: row.contact_id,
      eventId: row.event_id ?? undefined,
      eventTitle: row.event_id ? eventsMap.get(row.event_id)?.title : undefined,
      role: row.role,
      name: contact.display_name,
      email: contact.email ?? undefined,
      phone: contact.phone ?? undefined,
      notes: row.notes ?? undefined,
      sortOrder: row.sort_order,
      source: 'address_book',
    })
  }

  for (const event of (legacyEvents ?? []) as EventLocationRow[]) {
    const location = normalizeLegacyEventLocation(event.location)

    if (location.plannerName?.trim()) {
      contacts.push({
        id: `legacy-planner:${event.id}`,
        eventId: event.id,
        eventTitle: event.title,
        role: 'planner',
        name: location.plannerName.trim(),
        email: location.plannerEmail?.trim() || undefined,
        phone: location.plannerPhone?.trim() || undefined,
        source: 'legacy_planner',
      })
    }

    for (const [index, contact] of location.contacts.entries()) {
      if (!contact.name?.trim()) continue
      contacts.push({
        id: `legacy-contact:${event.id}:${contact.id ?? index}`,
        eventId: event.id,
        eventTitle: event.title,
        role: normalizeLegacyRole(contact.role),
        name: contact.name.trim(),
        email: contact.email?.trim() || undefined,
        phone: contact.phone?.trim() || undefined,
        notes: contact.notes?.trim() || undefined,
        source: 'legacy_event',
      })
    }
  }

  return contacts
}

interface CreateLeadContactInput {
  leadId: string
  brandId?: string
  brandSlug?: BrandSlug
  role: LeadContactRole
  name: string
  email?: string
  phone?: string
  notes?: string
}

export async function createLeadContact(input: CreateLeadContactInput) {
  const normalizedName = input.name.trim()
  if (!normalizedName) {
    throw new Error('Contact name is required')
  }

  let brandId = input.brandId
  if (!brandId && input.brandSlug) {
    brandId = await getBrandUuidFromSlug(input.brandSlug)
  }

  if (!brandId) {
    throw new Error('Unable to resolve brand for contact')
  }

  const { data: addressBookContact, error: addressBookError } = await supabaseClient
    .from('address_book_contacts')
    .insert({
      brand_id: brandId,
      display_name: normalizedName,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
    })
    .select('id')
    .single()

  if (addressBookError || !addressBookContact) {
    throw addressBookError ?? new Error('Unable to create address book contact')
  }

  const { data: existingLeadContacts, error: existingError } = await supabaseClient
    .from('lead_contacts')
    .select('sort_order')
    .eq('lead_id', input.leadId)

  if (existingError) throw existingError

  const nextSortOrder = Math.max(0, ...(existingLeadContacts ?? []).map((item) => item.sort_order ?? 0)) + 1

  const { error: linkError } = await supabaseClient
    .from('lead_contacts')
    .insert({
      lead_id: input.leadId,
      brand_id: brandId,
      contact_id: addressBookContact.id,
      role: input.role,
      source: 'manual',
      sort_order: nextSortOrder,
      notes: input.notes?.trim() || null,
    })

  if (linkError) throw linkError
}

interface UpdateLeadContactInput {
  leadId: string
  contactId: string
  role: LeadContactRole
  name: string
  email?: string
  phone?: string
  notes?: string
}

export async function updateLeadContact(input: UpdateLeadContactInput) {
  const normalizedName = input.name.trim()
  if (!normalizedName) {
    throw new Error('Contact name is required')
  }

  const { data: linkRow, error: linkError } = await supabaseClient
    .from('lead_contacts')
    .select('contact_id')
    .eq('id', input.contactId)
    .eq('lead_id', input.leadId)
    .maybeSingle()

  if (linkError) throw linkError
  if (!linkRow) throw new Error('Contact no longer exists')

  const { error: updateContactError } = await supabaseClient
    .from('address_book_contacts')
    .update({
      display_name: normalizedName,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
    })
    .eq('id', linkRow.contact_id)

  if (updateContactError) throw updateContactError

  const { error: updateLinkError } = await supabaseClient
    .from('lead_contacts')
    .update({
      role: input.role,
      notes: input.notes?.trim() || null,
    })
    .eq('id', input.contactId)

  if (updateLinkError) throw updateLinkError
}

export async function deleteLeadContact(leadId: string, contactId: string) {
  const { data: linkRow, error: linkError } = await supabaseClient
    .from('lead_contacts')
    .select('contact_id')
    .eq('id', contactId)
    .eq('lead_id', leadId)
    .maybeSingle()

  if (linkError) throw linkError
  if (!linkRow) throw new Error('Contact no longer exists')

  const { error: deleteLinkError } = await supabaseClient
    .from('lead_contacts')
    .delete()
    .eq('id', contactId)

  if (deleteLinkError) throw deleteLinkError

  const { data: remainingLinks, error: remainingError } = await supabaseClient
    .from('lead_contacts')
    .select('id')
    .eq('contact_id', linkRow.contact_id)
    .limit(1)

  if (remainingError) throw remainingError

  if (!(remainingLinks?.length ?? 0)) {
    await supabaseClient
      .from('address_book_contacts')
      .delete()
      .eq('id', linkRow.contact_id)
  }
}

export async function moveLeadContact(leadId: string, contactId: string, direction: 'up' | 'down') {
  const { data, error } = await supabaseClient
    .from('lead_contacts')
    .select('id, sort_order')
    .eq('lead_id', leadId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error

  const ordered = data ?? []
  const index = ordered.findIndex((contact) => contact.id === contactId)
  if (index < 0) {
    throw new Error('Contact no longer exists')
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= ordered.length) {
    return
  }

  const swapped = [...ordered]
  const current = swapped[index]
  swapped[index] = swapped[targetIndex]
  swapped[targetIndex] = current

  for (let orderIndex = 0; orderIndex < swapped.length; orderIndex += 1) {
    const row = swapped[orderIndex]
    const { error: updateError } = await supabaseClient
      .from('lead_contacts')
      .update({ sort_order: orderIndex + 1 })
      .eq('id', row.id)

    if (updateError) throw updateError
  }
}

function normalizeLegacyEventLocation(value: unknown): {
  plannerName?: string
  plannerEmail?: string
  plannerPhone?: string
  contacts: LegacyEventLocationContact[]
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { contacts: [] }
  }

  const location = value as Record<string, unknown>
  const contactsRaw = location.contacts
  const contacts = Array.isArray(contactsRaw)
    ? contactsRaw.filter((item): item is LegacyEventLocationContact => Boolean(item && typeof item === 'object'))
    : []

  return {
    plannerName: typeof location.plannerName === 'string' ? location.plannerName : undefined,
    plannerEmail: typeof location.plannerEmail === 'string' ? location.plannerEmail : undefined,
    plannerPhone: typeof location.plannerPhone === 'string' ? location.plannerPhone : undefined,
    contacts,
  }
}

function normalizeLegacyRole(value: unknown): LeadContactRole {
  if (
    value === 'bride' ||
    value === 'groom' ||
    value === 'parent' ||
    value === 'venue_coordinator' ||
    value === 'wedding_planner' ||
    value === 'vendor' ||
    value === 'other'
  ) {
    return value
  }

  return 'other'
}
