import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import { type BrandSlug } from '@/types'
import { type Json } from '@/lib/database.types'

export type AddressBookContactType = 'client' | 'venue' | 'planner' | 'provider' | 'employee'

export interface AddressBookLinkedContact {
  contactId: string
  relationship: string
  reciprocalRelationship?: string
}

export interface AddressBookProfile {
  contactType: AddressBookContactType
  role: string
  salutation: string
  firstName: string
  middleName: string
  lastNamePaternal: string
  lastNameMaternal: string
  gender: 'female' | 'male' | 'x' | ''
  addressLine1: string
  addressLine2: string
  cityTown: string
  stateProvince: string
  postalCode: string
  country: string
  primaryEmail: string
  secondaryEmail: string
  mobilePhone: string
  homePhone: string
  workPhone: string
  workExtension: string
  bestTimeToCall: string
  bestDayToCall: string
  contactPreference: string
  strictPrivacy: boolean
  optedInMarketing: boolean
  companyName: string
  position: string
  workAddress: string
  website: string
  facebook: string
  instagram: string
  tiktok: string
  pinterest: string
  linkedIn: string
  birthday: string
  anniversary: string
  linkedContacts: AddressBookLinkedContact[]
}

export interface AddressBookContactRecord {
  id: string
  brandId: string
  displayName: string
  profile: AddressBookProfile
  createdAt: string
  updatedAt: string
}

interface AddressBookRow {
  id: string
  brand_id: string
  display_name: string
  email: string | null
  phone: string | null
  company: string | null
  job_title: string | null
  tags: unknown
  created_at: string
  updated_at: string
}

const DEFAULT_PROFILE: AddressBookProfile = {
  contactType: 'client',
  role: '',
  salutation: '',
  firstName: '',
  middleName: '',
  lastNamePaternal: '',
  lastNameMaternal: '',
  gender: '',
  addressLine1: '',
  addressLine2: '',
  cityTown: '',
  stateProvince: '',
  postalCode: '',
  country: '',
  primaryEmail: '',
  secondaryEmail: '',
  mobilePhone: '',
  homePhone: '',
  workPhone: '',
  workExtension: '',
  bestTimeToCall: '',
  bestDayToCall: '',
  contactPreference: '',
  strictPrivacy: false,
  optedInMarketing: false,
  companyName: '',
  position: '',
  workAddress: '',
  website: '',
  facebook: '',
  instagram: '',
  tiktok: '',
  pinterest: '',
  linkedIn: '',
  birthday: '',
  anniversary: '',
  linkedContacts: [],
}

export function createEmptyAddressBookProfile(): AddressBookProfile {
  return { ...DEFAULT_PROFILE }
}

export async function fetchAddressBookContacts(brandSlug: BrandSlug): Promise<AddressBookContactRecord[]> {
  const brandId = await getBrandUuidFromSlug(brandSlug)

  const { data, error } = await supabaseClient
    .from('address_book_contacts')
    .select('id, brand_id, display_name, email, phone, company, job_title, tags, created_at, updated_at')
    .eq('brand_id', brandId)
    .order('display_name', { ascending: true })

  if (error) throw error

  return ((data ?? []) as AddressBookRow[]).map((row) => mapRowToRecord(row))
}

export async function createAddressBookContact(brandSlug: BrandSlug, profile: AddressBookProfile) {
  const brandId = await getBrandUuidFromSlug(brandSlug)

  const { data, error } = await supabaseClient
    .from('address_book_contacts')
    .insert(toCreatePayload(brandId, profile))
    .select('id, brand_id, display_name, email, phone, company, job_title, tags, created_at, updated_at')
    .single()

  if (error || !data) {
    throw error ?? new Error('Unable to create contact')
  }

  const created = mapRowToRecord(data as AddressBookRow)
  await syncBidirectionalLinks(created.id, profile.linkedContacts, [])

  return created
}

export async function ensureAddressBookContactForLeadClient(input: {
  brandSlug: BrandSlug
  name: string
  email: string
  phone?: string
}) {
  const brandId = await getBrandUuidFromSlug(input.brandSlug)
  const normalizedEmail = input.email.trim().toLowerCase()

  if (!normalizedEmail) {
    return
  }

  const { data: existing, error: existingError } = await supabaseClient
    .from('address_book_contacts')
    .select('id, display_name, phone, tags')
    .eq('brand_id', brandId)
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing) {
    const existingProfile = parseProfileFromTags(existing.tags)
    const nextProfile: AddressBookProfile = {
      ...existingProfile,
      contactType: 'client',
      primaryEmail: normalizedEmail,
      mobilePhone: existingProfile.mobilePhone || input.phone?.trim() || '',
    }

    if (!existingProfile.firstName && !existingProfile.lastNamePaternal) {
      const [firstName, ...rest] = input.name.trim().split(/\s+/)
      nextProfile.firstName = firstName ?? ''
      nextProfile.lastNamePaternal = rest.join(' ')
    }

    const { error: updateError } = await supabaseClient
      .from('address_book_contacts')
      .update({
        display_name: input.name.trim() || existing.display_name,
        phone: input.phone?.trim() || existing.phone || null,
        tags: {
          schema: 'address-book.v1',
          profile: serializeProfile(nextProfile),
        },
      })
      .eq('id', existing.id)

    if (updateError) {
      throw updateError
    }

    return
  }

  const [firstName, ...rest] = input.name.trim().split(/\s+/)
  const profile: AddressBookProfile = {
    ...createEmptyAddressBookProfile(),
    contactType: 'client',
    firstName: firstName ?? '',
    lastNamePaternal: rest.join(' '),
    primaryEmail: normalizedEmail,
    mobilePhone: input.phone?.trim() || '',
  }

  await createAddressBookContact(input.brandSlug, profile)
}

export async function updateAddressBookContact(contactId: string, profile: AddressBookProfile) {
  const { data: existingRow, error: existingError } = await supabaseClient
    .from('address_book_contacts')
    .select('id, tags')
    .eq('id', contactId)
    .maybeSingle()

  if (existingError) throw existingError

  const previousLinks = existingRow ? parseProfileFromTags(existingRow.tags).linkedContacts : []

  const { data, error } = await supabaseClient
    .from('address_book_contacts')
    .update(toUpdatePayload(profile))
    .eq('id', contactId)
    .select('id, brand_id, display_name, email, phone, company, job_title, tags, created_at, updated_at')
    .single()

  if (error || !data) {
    throw error ?? new Error('Unable to update contact')
  }

  const updated = mapRowToRecord(data as AddressBookRow)
  await syncBidirectionalLinks(contactId, profile.linkedContacts, previousLinks)

  return updated
}

export async function deleteAddressBookContact(contactId: string) {
  const { data: existingRow, error: existingError } = await supabaseClient
    .from('address_book_contacts')
    .select('brand_id, tags')
    .eq('id', contactId)
    .maybeSingle()

  if (existingError) throw existingError

  const previousLinks = existingRow ? parseProfileFromTags(existingRow.tags).linkedContacts : []

  const { error } = await supabaseClient
    .from('address_book_contacts')
    .delete()
    .eq('id', contactId)

  if (error) throw error

  for (const link of previousLinks) {
    await removeReciprocalLink(link.contactId, contactId)
  }

  if (existingRow?.brand_id) {
    await scrubDeletedContactFromBrand(existingRow.brand_id, contactId)
  }
}

function toCreatePayload(brandId: string, profile: AddressBookProfile) {
  return {
    brand_id: brandId,
    ...toUpdatePayload(profile),
  }
}

function toUpdatePayload(profile: AddressBookProfile) {
  const tags: Json = {
    schema: 'address-book.v1',
    profile: serializeProfile(profile),
  }

  return {
    display_name: buildDisplayName(profile),
    email: profile.primaryEmail.trim() || null,
    phone: profile.mobilePhone.trim() || null,
    company: profile.companyName.trim() || null,
    job_title: profile.position.trim() || null,
    notes: null,
    tags,
  }
}

function mapRowToRecord(row: AddressBookRow): AddressBookContactRecord {
  const profile = parseProfileFromTags(row.tags)

  const hydratedProfile: AddressBookProfile = {
    ...profile,
    primaryEmail: profile.primaryEmail || row.email || '',
    mobilePhone: profile.mobilePhone || row.phone || '',
    companyName: profile.companyName || row.company || '',
    position: profile.position || row.job_title || '',
  }

  return {
    id: row.id,
    brandId: row.brand_id,
    displayName: row.display_name,
    profile: hydratedProfile,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseProfileFromTags(value: unknown): AddressBookProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyAddressBookProfile()
  }

  const profileCandidate = (value as Record<string, unknown>).profile
  if (!profileCandidate || typeof profileCandidate !== 'object' || Array.isArray(profileCandidate)) {
    return createEmptyAddressBookProfile()
  }

  const source = profileCandidate as Record<string, unknown>

  return {
    contactType: parseContactType(source.contactType),
    role: readString(source.role),
    salutation: readString(source.salutation),
    firstName: readString(source.firstName),
    middleName: readString(source.middleName),
    lastNamePaternal: readString(source.lastNamePaternal),
    lastNameMaternal: readString(source.lastNameMaternal),
    gender: parseGender(source.gender),
    addressLine1: readString(source.addressLine1),
    addressLine2: readString(source.addressLine2),
    cityTown: readString(source.cityTown),
    stateProvince: readString(source.stateProvince),
    postalCode: readString(source.postalCode),
    country: readString(source.country),
    primaryEmail: readString(source.primaryEmail),
    secondaryEmail: readString(source.secondaryEmail),
    mobilePhone: readString(source.mobilePhone),
    homePhone: readString(source.homePhone),
    workPhone: readString(source.workPhone),
    workExtension: readString(source.workExtension),
    bestTimeToCall: readString(source.bestTimeToCall),
    bestDayToCall: readString(source.bestDayToCall),
    contactPreference: readString(source.contactPreference),
    strictPrivacy: readBoolean(source.strictPrivacy),
    optedInMarketing: readBoolean(source.optedInMarketing),
    companyName: readString(source.companyName),
    position: readString(source.position),
    workAddress: readString(source.workAddress),
    website: readString(source.website),
    facebook: readString(source.facebook),
    instagram: readString(source.instagram),
    tiktok: readString(source.tiktok),
    pinterest: readString(source.pinterest),
    linkedIn: readString(source.linkedIn),
    birthday: readString(source.birthday),
    anniversary: readString(source.anniversary),
    linkedContacts: parseLinkedContacts(source.linkedContacts),
  }
}

function buildDisplayName(profile: AddressBookProfile) {
  const parts = [profile.firstName, profile.middleName, profile.lastNamePaternal, profile.lastNameMaternal]
    .map((value) => value.trim())
    .filter(Boolean)

  if (parts.length) return parts.join(' ')
  if (profile.companyName.trim()) return profile.companyName.trim()
  if (profile.primaryEmail.trim()) return profile.primaryEmail.trim()
  return 'Untitled Contact'
}

function parseContactType(value: unknown): AddressBookContactType {
  if (value === 'client' || value === 'venue' || value === 'planner' || value === 'provider' || value === 'employee') {
    return value
  }
  return 'client'
}

function parseGender(value: unknown): AddressBookProfile['gender'] {
  if (value === 'female' || value === 'male' || value === 'x') {
    return value
  }
  return ''
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readBoolean(value: unknown): boolean {
  return value === true
}

function serializeProfile(profile: AddressBookProfile): Json {
  return {
    contactType: profile.contactType,
    role: profile.role,
    salutation: profile.salutation,
    firstName: profile.firstName,
    middleName: profile.middleName,
    lastNamePaternal: profile.lastNamePaternal,
    lastNameMaternal: profile.lastNameMaternal,
    gender: profile.gender,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    cityTown: profile.cityTown,
    stateProvince: profile.stateProvince,
    postalCode: profile.postalCode,
    country: profile.country,
    primaryEmail: profile.primaryEmail,
    secondaryEmail: profile.secondaryEmail,
    mobilePhone: profile.mobilePhone,
    homePhone: profile.homePhone,
    workPhone: profile.workPhone,
    workExtension: profile.workExtension,
    bestTimeToCall: profile.bestTimeToCall,
    bestDayToCall: profile.bestDayToCall,
    contactPreference: profile.contactPreference,
    strictPrivacy: profile.strictPrivacy,
    optedInMarketing: profile.optedInMarketing,
    companyName: profile.companyName,
    position: profile.position,
    workAddress: profile.workAddress,
    website: profile.website,
    facebook: profile.facebook,
    instagram: profile.instagram,
    tiktok: profile.tiktok,
    pinterest: profile.pinterest,
    linkedIn: profile.linkedIn,
    birthday: profile.birthday,
    anniversary: profile.anniversary,
    linkedContacts: profile.linkedContacts.map((item) => ({
      contactId: item.contactId,
      relationship: item.relationship,
      reciprocalRelationship: item.reciprocalRelationship ?? '',
    })),
  }
}

function parseLinkedContacts(value: unknown): AddressBookLinkedContact[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .map((item) => ({
      contactId: readString(item.contactId),
      relationship: readString(item.relationship),
      reciprocalRelationship: readString(item.reciprocalRelationship),
    }))
    .filter((item) => item.contactId)
}

async function syncBidirectionalLinks(
  sourceContactId: string,
  nextLinks: AddressBookLinkedContact[],
  previousLinks: AddressBookLinkedContact[],
) {
  const normalizedNext = dedupeLinks(nextLinks.filter((link) => link.contactId && link.contactId !== sourceContactId))
  const previousIds = new Set(previousLinks.map((link) => link.contactId))
  const nextIds = new Set(normalizedNext.map((link) => link.contactId))

  for (const link of normalizedNext) {
    await upsertReciprocalLink(link.contactId, {
      contactId: sourceContactId,
      relationship: link.reciprocalRelationship?.trim() || toReciprocalRelationship(link.relationship),
    })
  }

  for (const previousLink of previousLinks) {
    if (!nextIds.has(previousLink.contactId)) {
      await removeReciprocalLink(previousLink.contactId, sourceContactId)
    }
  }

  for (const nextLink of normalizedNext) {
    if (!previousIds.has(nextLink.contactId)) {
      continue
    }

    await upsertReciprocalLink(nextLink.contactId, {
      contactId: sourceContactId,
      relationship: nextLink.reciprocalRelationship?.trim() || toReciprocalRelationship(nextLink.relationship),
    })
  }
}

async function upsertReciprocalLink(targetContactId: string, reciprocalLink: AddressBookLinkedContact) {
  const { data: targetRow, error } = await supabaseClient
    .from('address_book_contacts')
    .select('id, tags')
    .eq('id', targetContactId)
    .maybeSingle()

  if (error) throw error
  if (!targetRow) return

  const targetProfile = parseProfileFromTags(targetRow.tags)
  const withoutCurrent = targetProfile.linkedContacts.filter((item) => item.contactId !== reciprocalLink.contactId)
  const nextProfile: AddressBookProfile = {
    ...targetProfile,
    linkedContacts: dedupeLinks([...withoutCurrent, reciprocalLink]),
  }

  const { error: updateError } = await supabaseClient
    .from('address_book_contacts')
    .update({
      tags: {
        schema: 'address-book.v1',
        profile: serializeProfile(nextProfile),
      },
    })
    .eq('id', targetContactId)

  if (updateError) throw updateError
}

async function removeReciprocalLink(targetContactId: string, sourceContactId: string) {
  const { data: targetRow, error } = await supabaseClient
    .from('address_book_contacts')
    .select('id, tags')
    .eq('id', targetContactId)
    .maybeSingle()

  if (error) throw error
  if (!targetRow) return

  const targetProfile = parseProfileFromTags(targetRow.tags)
  const nextLinks = targetProfile.linkedContacts.filter((item) => item.contactId !== sourceContactId)

  if (nextLinks.length === targetProfile.linkedContacts.length) {
    return
  }

  const nextProfile: AddressBookProfile = {
    ...targetProfile,
    linkedContacts: nextLinks,
  }

  const { error: updateError } = await supabaseClient
    .from('address_book_contacts')
    .update({
      tags: {
        schema: 'address-book.v1',
        profile: serializeProfile(nextProfile),
      },
    })
    .eq('id', targetContactId)

  if (updateError) throw updateError
}

async function scrubDeletedContactFromBrand(brandId: string, deletedContactId: string) {
  const { data, error } = await supabaseClient
    .from('address_book_contacts')
    .select('id, tags')
    .eq('brand_id', brandId)

  if (error) throw error

  for (const row of data ?? []) {
    const profile = parseProfileFromTags(row.tags)
    const nextLinks = profile.linkedContacts.filter((item) => item.contactId !== deletedContactId)
    if (nextLinks.length === profile.linkedContacts.length) {
      continue
    }

    const { error: updateError } = await supabaseClient
      .from('address_book_contacts')
      .update({
        tags: {
          schema: 'address-book.v1',
          profile: serializeProfile({
            ...profile,
            linkedContacts: nextLinks,
          }),
        },
      })
      .eq('id', row.id)

    if (updateError) throw updateError
  }
}

function dedupeLinks(links: AddressBookLinkedContact[]): AddressBookLinkedContact[] {
  const map = new Map<string, AddressBookLinkedContact>()
  for (const link of links) {
    if (!link.contactId) continue
    map.set(link.contactId, {
      contactId: link.contactId,
      relationship: link.relationship,
      reciprocalRelationship: link.reciprocalRelationship,
    })
  }
  return Array.from(map.values())
}

function toReciprocalRelationship(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'bride') return 'Groom'
  if (normalized === 'groom') return 'Bride'
  if (normalized === 'planner') return 'Client'
  if (normalized === 'venue') return 'Client'
  if (normalized === 'parent') return 'Child'
  if (normalized === 'provider') return 'Client'
  if (!value.trim()) return 'Linked'
  return value
}
