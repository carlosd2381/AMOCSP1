import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Pencil, Trash2, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import {
  DEFAULT_CLIENT_MARKET_PROFILE,
  type ClientLanguage,
  type ClientMarketType,
  type LeadRecord,
  type PricingCatalogKey,
} from '@/types'
import {
  createLeadContact,
  deleteLeadContact,
  fetchLeadContacts,
  updateLeadContact,
  type LeadContactRecord,
  type LeadContactRole,
} from '@/services/leadContactsService'
import {
  deleteLeadVenueAssignment,
  fetchLeadVenueAssignments,
  fetchVenueProfiles,
  saveLeadVenueAssignment,
  type LeadVenueLocationKind,
} from '@/services/leadVenueService'
import { fetchLeadOverviewSnapshot } from '@/services/leadProfileService'
import { updateLeadProfile } from '@/services/leadService'
import { LeadTasksCard } from './LeadTasksCard'
import { LeadActivityFeedCard } from './LeadActivityFeedCard'
import { type LeadProfileTab } from '@/modules/leads/profile/leadProfileTabs'

interface LeadOverviewTabProps {
  lead: LeadRecord
  onSelectTab?: (tab: LeadProfileTab, focusTarget?: string) => void
}

interface ContactEditorValues {
  name: string
  role: LeadContactRole
  email: string
  phone: string
  notes: string
}

const ROLE_OPTIONS: Array<{ value: LeadContactRole; label: string }> = [
  { value: 'bride', label: 'Bride' },
  { value: 'groom', label: 'Groom' },
  { value: 'parent', label: 'Parent' },
  { value: 'venue_coordinator', label: 'Venue Coordinator' },
  { value: 'wedding_planner', label: 'Wedding Planner' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'other', label: 'Other' },
]

const INPUT_CLASS = 'input-compact w-full'
const CONTACT_ROW_CLASS =
  'rounded-xl border border-border/30 bg-surface-muted/20 px-3 py-3 transition-colors duration-200 hover:border-border/60 hover:bg-surface-muted/30'
const CONTACT_ROW_GRID_CLASS = 'grid gap-3 md:grid-cols-[6.25rem_minmax(0,1fr)_auto] md:items-start'
const UNIFORM_ACTION_BUTTON_CLASS = 'h-9 w-36 justify-center'
const VENUE_LOCATION_OPTIONS: Array<{ value: LeadVenueLocationKind; label: string }> = [
  { value: 'ceremony', label: 'Ceremony' },
  { value: 'reception', label: 'Reception' },
  { value: 'bridal_session', label: 'Bridal Session' },
  { value: 'other', label: 'Other' },
]

export function LeadOverviewTab({ lead, onSelectTab }: LeadOverviewTabProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isAdding, setIsAdding] = useState(false)
  const [isEditingVenue, setIsEditingVenue] = useState(false)
  const [editingVenueAssignmentId, setEditingVenueAssignmentId] = useState<string | 'new' | null>(null)
  const [newContact, setNewContact] = useState<ContactEditorValues>(initialContactValues())
  const [editingContactId, setEditingContactId] = useState<string | null>(null)
  const [editingContact, setEditingContact] = useState<ContactEditorValues>(initialContactValues())
  const [marketClientType, setMarketClientType] = useState<ClientMarketType>(lead.client.marketProfile?.clientType ?? 'INT')
  const [marketLanguage, setMarketLanguage] = useState<ClientLanguage>(lead.client.marketProfile?.preferredLanguage ?? 'en')
  const [marketCurrency, setMarketCurrency] = useState<'USD' | 'MXN'>(lead.client.marketProfile?.preferredCurrency ?? 'USD')
  const [marketCatalog, setMarketCatalog] = useState<PricingCatalogKey>(lead.client.marketProfile?.preferredCatalog ?? 'INT_USD_ENG')

  useEffect(() => {
    const profile = lead.client.marketProfile ?? DEFAULT_CLIENT_MARKET_PROFILE
    setMarketClientType(profile.clientType)
    setMarketLanguage(profile.preferredLanguage)
    setMarketCurrency(profile.preferredCurrency)
    setMarketCatalog(profile.preferredCatalog)
  }, [lead.client.marketProfile])

  const contactsQuery = useQuery({
    queryKey: ['lead-contacts', lead.id],
    queryFn: () => fetchLeadContacts(lead),
  })

  const venueQuery = useQuery({
    queryKey: ['lead-venues', lead.id],
    queryFn: () => fetchLeadVenueAssignments(lead.id),
  })

  const venueProfilesQuery = useQuery({
    queryKey: ['venue-profiles', lead.client.brandId ?? lead.client.brandSlug],
    queryFn: () => fetchVenueProfiles({ brandId: lead.client.brandId, brandSlug: lead.client.brandSlug }),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createLeadContact({
        leadId: lead.id,
        brandId: lead.client.brandId,
        brandSlug: lead.client.brandSlug,
        role: newContact.role,
        name: newContact.name,
        email: newContact.email,
        phone: newContact.phone,
        notes: newContact.notes,
      }),
    onSuccess: () => {
      setNewContact(initialContactValues())
      setIsAdding(false)
      queryClient.invalidateQueries({ queryKey: ['lead-contacts', lead.id] })
      toast.success('Contact added')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to add contact')
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingContactId) {
        throw new Error('Missing contact id')
      }

      return updateLeadContact({
        leadId: lead.id,
        contactId: editingContactId,
        role: editingContact.role,
        name: editingContact.name,
        email: editingContact.email,
        phone: editingContact.phone,
        notes: editingContact.notes,
      })
    },
    onSuccess: () => {
      setEditingContactId(null)
      setEditingContact(initialContactValues())
      queryClient.invalidateQueries({ queryKey: ['lead-contacts', lead.id] })
      toast.success('Contact updated')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to update contact')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (contactId: string) => deleteLeadContact(lead.id, contactId),
    onSuccess: () => {
      if (editingContactId) {
        setEditingContactId(null)
        setEditingContact(initialContactValues())
      }
      queryClient.invalidateQueries({ queryKey: ['lead-contacts', lead.id] })
      toast.success('Contact removed')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to remove contact')
    },
  })

  const venueMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return saveLeadVenueAssignment({
        assignmentId: editingVenueAssignmentId && editingVenueAssignmentId !== 'new' ? editingVenueAssignmentId : undefined,
        leadId: lead.id,
        brandId: lead.client.brandId,
        brandSlug: lead.client.brandSlug,
        locationKind: String(formData.get('locationKind') ?? 'reception') as LeadVenueLocationKind,
        locationLabel: String(formData.get('locationLabel') ?? ''),
        sortOrder: Number(String(formData.get('sortOrder') ?? '0')) || 0,
        venueProfileId: String(formData.get('venueProfileId') ?? ''),
        forceCreateVenueProfile: formData.get('forceCreateVenueProfile') === 'on',
        notes: String(formData.get('assignmentNotes') ?? ''),
        venue: {
          name: String(formData.get('name') ?? ''),
          resortGroup: String(formData.get('resortGroup') ?? ''),
          addressLine1: String(formData.get('addressLine1') ?? ''),
          addressLine2: String(formData.get('addressLine2') ?? ''),
          city: String(formData.get('city') ?? ''),
          stateProvince: String(formData.get('stateProvince') ?? ''),
          postalCode: String(formData.get('postalCode') ?? ''),
          country: String(formData.get('country') ?? ''),
          phone: String(formData.get('phone') ?? ''),
          email: String(formData.get('email') ?? ''),
          website: String(formData.get('website') ?? ''),
          notes: String(formData.get('venueNotes') ?? ''),
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-venues', lead.id] })
      toast.success('Venue details saved')
      setIsEditingVenue(false)
      setEditingVenueAssignmentId(null)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to save venue details')
    },
  })

  const deleteVenueMutation = useMutation({
    mutationFn: (assignmentId: string) => deleteLeadVenueAssignment(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-venues', lead.id] })
      toast.success('Venue location removed')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to remove venue location')
    },
  })

  const marketProfileMutation = useMutation({
    mutationFn: () => updateLeadProfile({
      leadId: lead.id,
      clientId: lead.client.id,
      name: lead.client.name,
      email: lead.client.email,
      phone: lead.client.phone,
      type: lead.client.type,
      eventDate: lead.eventDate,
      source: lead.source,
      notes: lead.notes,
      status: lead.status,
      marketProfile: {
        clientType: marketClientType,
        preferredLanguage: marketLanguage,
        preferredCurrency: marketCurrency,
        preferredCatalog: marketCatalog,
      },
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lead-profile', lead.id] }),
        queryClient.invalidateQueries({ queryKey: ['lead-board'] }),
      ])
      toast.success('Client market profile updated')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to update market profile')
    },
  })

  const allContacts = contactsQuery.data ?? []
  const venueAssignments = venueQuery.data ?? []
  const hasVenueDetails = venueAssignments.length > 0
  const venueContacts = allContacts.filter((contact) => contact.role === 'venue_coordinator')
  const nonVenueContacts = allContacts.filter((contact) => contact.role !== 'venue_coordinator')
  const editableContacts = allContacts.filter((contact) => contact.source === 'address_book')
  const linkedContacts = allContacts.filter((contact) => contact.source !== 'address_book' && contact.role !== 'venue_coordinator')

  const openAddressBookProfile = (contact: LeadContactRecord) => {
    if (!contact.addressBookContactId) return
    navigate(`/address-book?mode=edit&contactId=${encodeURIComponent(contact.addressBookContactId)}`)
  }

  const snapshotQuery = useQuery({
    queryKey: ['lead-overview', lead.id],
    queryFn: () => fetchLeadOverviewSnapshot(lead.id),
  })

  const nextBookingStep = (snapshotQuery.data?.bookingProgress.steps ?? []).find((step) => step.status !== 'complete')

  const handleBookingStepAction = (stepKey: 'quote' | 'questionnaire' | 'contract' | 'invoice') => {
    if (stepKey === 'quote') {
      navigate(`/quotes/new?leadId=${encodeURIComponent(lead.id)}`)
      return
    }

    if (stepKey === 'questionnaire') {
      onSelectTab?.('questionnaires')
      return
    }

    if (stepKey === 'contract') {
      onSelectTab?.('contracts')
      return
    }

    onSelectTab?.('quotes-orders')
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card
          className="p-4"
          title={<h2 className="text-2xl font-semibold text-white">Client Market Profile</h2>}
        >
          <div className="space-y-3">
            <p className="text-sm text-brand-muted">
              These defaults sync into Quote Builder and can be overridden per quote.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Client Type
                <select
                  className="select-compact w-full"
                  value={marketClientType}
                  onChange={(event) => {
                    const nextType = event.target.value as ClientMarketType
                    setMarketClientType(nextType)
                    setMarketLanguage(nextType === 'MEX' ? 'es' : 'en')
                    setMarketCurrency(nextType === 'MEX' ? 'MXN' : 'USD')
                    setMarketCatalog(nextType === 'MEX' ? 'MEX_MXN_ESP' : 'INT_USD_ENG')
                  }}
                >
                  <option value="INT">INT</option>
                  <option value="MEX">MEX</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Language
                <select
                  className="select-compact w-full"
                  value={marketLanguage}
                  onChange={(event) => setMarketLanguage(event.target.value as ClientLanguage)}
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Currency Default
                <select
                  className="select-compact w-full"
                  value={marketCurrency}
                  onChange={(event) => setMarketCurrency(event.target.value as 'USD' | 'MXN')}
                >
                  <option value="USD">USD</option>
                  <option value="MXN">MXN</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                Pricing Catalog
                <select
                  className="select-compact w-full"
                  value={marketCatalog}
                  onChange={(event) => setMarketCatalog(event.target.value as PricingCatalogKey)}
                >
                  <option value="INT_USD_ENG">International Pricing (USD-ENG)</option>
                  <option value="MEX_MXN_ESP">National Pricing (MXN-ESP)</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="btn-compact-primary"
                onClick={() => void marketProfileMutation.mutateAsync()}
                disabled={marketProfileMutation.isPending}
              >
                {marketProfileMutation.isPending ? 'Saving…' : 'Save Market Defaults'}
              </button>
            </div>
          </div>
        </Card>

        <Card
          className="p-4"
          title={<h2 className="text-3xl font-semibold text-white">Venues</h2>}
        >
          <div className="space-y-4">
            <section className="space-y-2">
              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Locations</p>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingVenue(true)
                    setEditingVenueAssignmentId('new')
                  }}
                  className={`btn-compact-primary ${UNIFORM_ACTION_BUTTON_CLASS}`}
                >
                  Add Location
                </button>
              </div>

              {!hasVenueDetails && !isEditingVenue ? (
                <div className={CONTACT_ROW_CLASS}>
                  <p className="text-sm text-brand-muted">No locations linked yet. Add ceremony, reception, bridal session, or custom locations.</p>
                </div>
              ) : null}

              {venueAssignments.map((assignment) => {
                const isEditingThis = isEditingVenue && editingVenueAssignmentId === assignment.assignmentId
                return (
                  <div key={assignment.assignmentId}>
                    {!isEditingThis ? (
                      <article className={CONTACT_ROW_CLASS}>
                        <div className={CONTACT_ROW_GRID_CLASS}>
                          <div>
                            <p className="text-base font-semibold text-white">{formatVenueLocationKind(assignment.locationKind)}</p>
                            {assignment.locationLabel ? (
                              <span className="mt-1 inline-flex rounded-lg border border-border/50 px-2 py-0.5 text-xs text-brand-muted">
                                {assignment.locationLabel}
                              </span>
                            ) : null}
                          </div>

                          <div className="min-w-[220px] flex-1">
                            {assignment.venueProfileId ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/venues/${assignment.venueProfileId}`)}
                                className="text-[1.4rem] font-semibold leading-tight text-sky-300 underline-offset-4 transition hover:underline"
                              >
                                {assignment.venue.name}
                              </button>
                            ) : (
                              <p className="text-[1.4rem] font-semibold leading-tight text-sky-300">{assignment.venue.name}</p>
                            )}
                            {assignment.venue.resortGroup ? <p className="text-base text-sky-300">{assignment.venue.resortGroup}</p> : null}
                            {assignment.venue.phone ? <p className="text-base text-sky-300">{assignment.venue.phone}</p> : null}
                            {assignment.venue.email ? <p className="text-base text-sky-300">{assignment.venue.email}</p> : null}
                            {assignment.venue.website ? <p className="mt-1 text-xs text-brand-muted">Website: {assignment.venue.website}</p> : null}
                            {formatVenueLocation(assignment.venue) ? (
                              <p className="mt-1 text-xs text-brand-muted">{formatVenueLocation(assignment.venue)}</p>
                            ) : null}
                            {assignment.venue.notes ? <p className="mt-1 text-xs text-brand-muted">Venue notes: {assignment.venue.notes}</p> : null}
                            {assignment.notes ? <p className="mt-1 text-xs text-brand-muted">Lead notes: {assignment.notes}</p> : null}
                          </div>

                          <div className="flex gap-2 md:justify-self-end">
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingVenue(true)
                                setEditingVenueAssignmentId(assignment.assignmentId)
                              }}
                              className="btn-compact-secondary"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const approved = window.confirm('Delete this location from this lead?')
                                if (!approved) return
                                deleteVenueMutation.mutate(assignment.assignmentId)
                              }}
                              className="btn-compact-secondary"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    ) : (
                      <form
                        key={`edit-${assignment.assignmentId}:${assignment.venue.updatedAt}`}
                        onSubmit={(event) => {
                          event.preventDefault()
                          const formData = new FormData(event.currentTarget)
                          venueMutation.mutate(formData)
                        }}
                        className="grid gap-2 border border-border/30 bg-surface-muted/20 p-3"
                      >
                        <div className="grid gap-2 sm:grid-cols-5">
                          <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                            Location Type
                            <select name="locationKind" defaultValue={assignment.locationKind} className="select-compact w-full">
                              {VENUE_LOCATION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                            Location Label
                            <input name="locationLabel" defaultValue={assignment.locationLabel ?? ''} className={INPUT_CLASS} placeholder="e.g. Church Ceremony" />
                          </label>
                          <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                            Sort Order
                            <input name="sortOrder" type="number" min={0} defaultValue={assignment.sortOrder} className={INPUT_CLASS} placeholder="0" />
                          </label>
                          <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted sm:col-span-2">
                            Existing Venue
                            <select name="venueProfileId" defaultValue={assignment.venueProfileId} className="select-compact w-full">
                              <option value="">Create / update from fields below</option>
                              {(venueProfilesQuery.data ?? []).map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.name}
                                  {profile.city ? ` - ${profile.city}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <input name="name" defaultValue={assignment.venue.name ?? ''} className={INPUT_CLASS} placeholder="Venue name" />
                          <input name="resortGroup" defaultValue={assignment.venue.resortGroup ?? ''} className={INPUT_CLASS} placeholder="Resort group" />
                          <input name="addressLine1" defaultValue={assignment.venue.addressLine1 ?? ''} className={INPUT_CLASS} placeholder="Address line 1" />
                          <input name="addressLine2" defaultValue={assignment.venue.addressLine2 ?? ''} className={INPUT_CLASS} placeholder="Address line 2" />
                          <input name="city" defaultValue={assignment.venue.city ?? ''} className={INPUT_CLASS} placeholder="City" />
                          <input name="stateProvince" defaultValue={assignment.venue.stateProvince ?? ''} className={INPUT_CLASS} placeholder="State / Province" />
                          <input name="postalCode" defaultValue={assignment.venue.postalCode ?? ''} className={INPUT_CLASS} placeholder="Postal code" />
                          <input name="country" defaultValue={assignment.venue.country ?? ''} className={INPUT_CLASS} placeholder="Country" />
                          <input name="phone" defaultValue={assignment.venue.phone ?? ''} className={INPUT_CLASS} placeholder="Venue phone" />
                          <input name="email" defaultValue={assignment.venue.email ?? ''} className={INPUT_CLASS} placeholder="Venue email" />
                          <input name="website" defaultValue={assignment.venue.website ?? ''} className={INPUT_CLASS} placeholder="Website" />
                        </div>

                        <label className="inline-flex items-center gap-2 border border-border/40 bg-surface-muted/20 px-3 py-2 text-xs text-brand-muted">
                          <input type="checkbox" name="forceCreateVenueProfile" className="h-4 w-4" />
                          Save as new venue profile
                        </label>

                        <textarea name="venueNotes" defaultValue={assignment.venue.notes ?? ''} rows={2} className={INPUT_CLASS} placeholder="Venue details notes" />
                        <textarea name="assignmentNotes" defaultValue={assignment.notes ?? ''} rows={2} className={INPUT_CLASS} placeholder="Lead-specific location notes" />

                        <div className="flex items-center gap-2">
                          <button type="submit" disabled={venueMutation.isPending} className="btn-compact-primary">
                            {venueMutation.isPending ? 'Saving…' : 'Save Location'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingVenueAssignmentId(null)
                              setIsEditingVenue(false)
                            }}
                            className="btn-compact-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )
              })}

              {isEditingVenue && editingVenueAssignmentId === 'new' ? (
                <form
                  key="new-venue-location"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const formData = new FormData(event.currentTarget)
                    venueMutation.mutate(formData)
                  }}
                  className="grid gap-2 border border-border/30 bg-surface-muted/20 p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-5">
                    <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                      Location Type
                      <select name="locationKind" defaultValue="reception" className="select-compact w-full">
                        {VENUE_LOCATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                      Location Label
                      <input name="locationLabel" className={INPUT_CLASS} placeholder="e.g. Church Ceremony" />
                    </label>
                    <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                      Sort Order
                      <input name="sortOrder" type="number" min={0} defaultValue={venueAssignments.length} className={INPUT_CLASS} placeholder="0" />
                    </label>
                    <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted sm:col-span-2">
                      Existing Venue
                      <select name="venueProfileId" defaultValue="" className="select-compact w-full">
                        <option value="">Create / update from fields below</option>
                        {(venueProfilesQuery.data ?? []).map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                            {profile.city ? ` - ${profile.city}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <input name="name" className={INPUT_CLASS} placeholder="Venue name" />
                    <input name="resortGroup" className={INPUT_CLASS} placeholder="Resort group" />
                    <input name="addressLine1" className={INPUT_CLASS} placeholder="Address line 1" />
                    <input name="addressLine2" className={INPUT_CLASS} placeholder="Address line 2" />
                    <input name="city" className={INPUT_CLASS} placeholder="City" />
                    <input name="stateProvince" className={INPUT_CLASS} placeholder="State / Province" />
                    <input name="postalCode" className={INPUT_CLASS} placeholder="Postal code" />
                    <input name="country" className={INPUT_CLASS} placeholder="Country" />
                    <input name="phone" className={INPUT_CLASS} placeholder="Venue phone" />
                    <input name="email" className={INPUT_CLASS} placeholder="Venue email" />
                    <input name="website" className={INPUT_CLASS} placeholder="Website" />
                  </div>

                  <label className="inline-flex items-center gap-2 border border-border/40 bg-surface-muted/20 px-3 py-2 text-xs text-brand-muted">
                    <input type="checkbox" name="forceCreateVenueProfile" className="h-4 w-4" />
                    Save as new venue profile
                  </label>

                  <textarea name="venueNotes" rows={2} className={INPUT_CLASS} placeholder="Venue details notes" />
                  <textarea name="assignmentNotes" rows={2} className={INPUT_CLASS} placeholder="Lead-specific location notes" />

                  <div className="flex items-center gap-2">
                    <button type="submit" disabled={venueMutation.isPending} className="btn-compact-primary">
                      {venueMutation.isPending ? 'Saving…' : 'Save Location'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingVenueAssignmentId(null)
                        setIsEditingVenue(false)
                      }}
                      className="btn-compact-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Venue Team</p>
                <span className="rounded-md border border-border/40 px-1.5 py-0.5 text-[11px] text-brand-muted">{venueContacts.length}</span>
              </div>

              {contactsQuery.isLoading ? <p className="text-sm text-brand-muted">Loading venue staff…</p> : null}
              {!contactsQuery.isLoading && !venueContacts.length ? (
                <p className="text-xs text-brand-muted">No venue staff linked yet. Add a contact with role Venue Coordinator.</p>
              ) : null}

              {!contactsQuery.isLoading && venueContacts.map((contact) => (
                <article key={`venue-${contact.id}`} className={CONTACT_ROW_CLASS}>
                  <div className={CONTACT_ROW_GRID_CLASS}>
                    <div>
                      <p className="text-base font-semibold text-white">Venue</p>
                      <span className="mt-1 inline-flex rounded-lg border border-border/50 px-2 py-0.5 text-xs text-brand-muted">
                        {formatContactTag(contact.source)}
                      </span>
                    </div>

                    <div className="min-w-[220px] flex-1">
                      {contact.addressBookContactId ? (
                        <button
                          type="button"
                          onClick={() => openAddressBookProfile(contact)}
                          className="text-[1.4rem] font-semibold leading-tight text-sky-300 underline-offset-4 transition hover:underline"
                        >
                          {contact.name}
                        </button>
                      ) : (
                        <p className="text-[1.4rem] font-semibold leading-tight text-sky-300">{contact.name}</p>
                      )}
                      {contact.phone ? <p className="text-base text-sky-300">{contact.phone}</p> : null}
                      {contact.email ? <p className="text-base text-sky-300">{contact.email}</p> : null}
                      {contact.eventTitle ? <p className="mt-1 text-xs text-brand-muted">Event: {contact.eventTitle}</p> : null}
                    </div>

                    <div className="md:justify-self-end">
                      <button
                        type="button"
                        onClick={() => onSelectTab?.('contacts')}
                        className="btn-compact-secondary"
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </div>
        </Card>

        <Card
          className="p-4"
          title={<h2 className="text-3xl font-semibold text-white">Contacts</h2>}
        >
          {contactsQuery.isLoading ? <p className="text-sm text-brand-muted">Loading contacts…</p> : null}

          {!contactsQuery.isLoading ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Contacts</p>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-border/40 px-1.5 py-0.5 text-[11px] text-brand-muted">{nonVenueContacts.length}</span>
                  <button
                    type="button"
                    onClick={() => setIsAdding((value) => !value)}
                    className={`inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm text-white transition hover:border-border ${UNIFORM_ACTION_BUTTON_CLASS}`}
                  >
                    <UserPlus size={15} />
                    {isAdding ? 'Close' : 'Add Contact'}
                  </button>
                </div>
              </div>

              {isAdding ? (
                <div className="rounded-2xl border border-border/40 bg-surface-muted/40 p-3">
                  <ContactEditor
                    values={newContact}
                    onChange={setNewContact}
                    onSubmit={() => createMutation.mutate()}
                    submitLabel="Add"
                    isSubmitting={createMutation.isPending}
                  />
                </div>
              ) : null}

              {linkedContacts.length ? (
                <div className="flex items-center justify-between border-b border-border/30 pb-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Linked Contacts</p>
                  <span className="rounded-md border border-border/40 px-1.5 py-0.5 text-[11px] text-brand-muted">{linkedContacts.length}</span>
                </div>
              ) : null}
              {linkedContacts.map((contact) => (
                <article key={contact.id} className={CONTACT_ROW_CLASS}>
                  <div className={CONTACT_ROW_GRID_CLASS}>
                    <div>
                      <p className="text-base font-semibold text-white">{formatContactRole(contact.role)}</p>
                      <span className="mt-1 inline-flex rounded-lg border border-border/50 px-2 py-0.5 text-xs text-brand-muted">
                        {formatContactRole(contact.role)}
                      </span>
                    </div>

                    <div className="min-w-[220px] flex-1">
                      {contact.addressBookContactId ? (
                        <button
                          type="button"
                          onClick={() => openAddressBookProfile(contact)}
                          className="text-[1.4rem] font-semibold leading-tight text-sky-300 underline-offset-4 transition hover:underline"
                        >
                          {contact.name}
                        </button>
                      ) : (
                        <p className="text-[1.4rem] font-semibold leading-tight text-sky-300">{contact.name}</p>
                      )}
                      {contact.phone ? <p className="text-base text-sky-300">{contact.phone}</p> : null}
                      {contact.email ? <p className="text-base text-sky-300">{contact.email}</p> : null}
                      {contact.eventTitle ? <p className="mt-1 text-xs text-brand-muted">Event: {contact.eventTitle}</p> : null}
                    </div>

                    <div className="md:justify-self-end">
                      <span className="inline-flex rounded-lg border border-border/40 px-2 py-1 text-xs text-brand-muted">Linked</span>
                    </div>
                  </div>
                </article>
              ))}

              {editableContacts.length ? (
                <div className="flex items-center justify-between border-b border-border/30 pb-2 pt-1">
                  <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Event Contacts</p>
                  <span className="rounded-md border border-border/40 px-1.5 py-0.5 text-[11px] text-brand-muted">{editableContacts.length}</span>
                </div>
              ) : null}
              {editableContacts.map((contact) => {
                const isEditing = editingContactId === contact.id
                return (
                  <article key={contact.id} className={CONTACT_ROW_CLASS}>
                    {isEditing ? (
                      <div className="space-y-2">
                        <ContactEditor
                          values={editingContact}
                          onChange={setEditingContact}
                          onSubmit={() => updateMutation.mutate()}
                          submitLabel="Save"
                          isSubmitting={updateMutation.isPending}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setEditingContactId(null)
                            setEditingContact(initialContactValues())
                          }}
                          className="btn-compact-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className={CONTACT_ROW_GRID_CLASS}>
                        <div>
                          <p className="text-base font-semibold text-white">{formatContactRole(contact.role)}</p>
                          <span className="mt-1 inline-flex rounded-lg border border-border/50 px-2 py-0.5 text-xs text-brand-muted">
                            {formatContactRole(contact.role)}
                          </span>
                        </div>

                        <div className="min-w-[220px] flex-1">
                          {contact.addressBookContactId ? (
                            <button
                              type="button"
                              onClick={() => openAddressBookProfile(contact)}
                              className="text-[1.4rem] font-semibold leading-tight text-sky-300 underline-offset-4 transition hover:underline"
                            >
                              {contact.name}
                            </button>
                          ) : (
                            <p className="text-[1.4rem] font-semibold leading-tight text-sky-300">{contact.name}</p>
                          )}
                          {contact.phone ? <p className="text-base text-sky-300">{contact.phone}</p> : null}
                          {contact.email ? <p className="text-base text-sky-300">{contact.email}</p> : null}
                          {contact.notes ? <p className="mt-1 text-xs text-brand-muted">{contact.notes}</p> : null}
                          {contact.eventTitle ? <p className="mt-1 text-xs text-brand-muted">Event: {contact.eventTitle}</p> : null}
                        </div>

                        <div className="flex gap-2 md:justify-self-end">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingContactId(contact.id)
                              setEditingContact({
                                name: contact.name,
                                role: normalizeEditableRole(contact.role),
                                email: contact.email ?? '',
                                phone: contact.phone ?? '',
                                notes: contact.notes ?? '',
                              })
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-border/60 px-2 py-1 text-xs text-white transition hover:border-border"
                          >
                            <Pencil size={13} /> Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm('Remove this contact from the lead?')) return
                              deleteMutation.mutate(contact.id)
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-red-500/60 px-2 py-1 text-xs text-red-100 transition hover:border-red-400"
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}

              {!allContacts.length ? (
                <p className="text-sm text-brand-muted">No contacts yet. Use Add Contact to create your first event contact.</p>
              ) : null}
            </section>
          ) : null}
        </Card>
      </div>

    <div className="space-y-4">
      <Card title="Snapshot" className="p-4">
        {snapshotQuery.isLoading ? <p className="text-sm text-brand-muted">Loading overview…</p> : null}
        {!snapshotQuery.isLoading ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border/40 bg-surface-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Booking Progress</p>
                <span className="rounded-md border border-border/40 px-1.5 py-0.5 text-[11px] text-brand-muted">
                  {snapshotQuery.data?.bookingProgress.completedCount ?? 0}/{snapshotQuery.data?.bookingProgress.totalCount ?? 4}
                </span>
              </div>
              <p className="mb-2 text-xs text-brand-muted">Quote &gt; Questionnaire &gt; Contract &gt; Invoice(s)</p>
              {nextBookingStep ? (
                <div className="mb-2 flex items-center justify-between border border-brand-primary/30 bg-brand-primary/10 px-2.5 py-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-brand-muted">Next Recommended Step</p>
                    <p className="text-sm text-white">{nextBookingStep.label}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-compact-primary"
                    onClick={() => handleBookingStepAction(nextBookingStep.key)}
                  >
                    Open
                  </button>
                </div>
              ) : (
                <div className="mb-2 border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-200">
                  Booking flow complete. All core milestones are finished.
                </div>
              )}
              <div className="space-y-2">
                {(snapshotQuery.data?.bookingProgress.steps ?? []).map((step) => (
                  <div key={step.key} className="flex items-start justify-between gap-2 border border-border/30 px-2.5 py-2">
                    <div>
                      <p className="text-sm font-medium text-white">{step.label}</p>
                      <p className="text-xs text-brand-muted">{step.detail}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={[
                        'rounded-md px-2 py-0.5 text-[11px] uppercase tracking-[0.08em]',
                        step.status === 'complete'
                          ? 'border border-emerald-400/40 text-emerald-300'
                          : step.status === 'in_progress'
                            ? 'border border-amber-400/40 text-amber-300'
                            : 'border border-border/40 text-brand-muted',
                      ].join(' ')}>
                        {step.status === 'complete' ? 'Complete' : step.status === 'in_progress' ? 'In Progress' : 'Pending'}
                      </span>
                      <button
                        type="button"
                        className="btn-compact-secondary"
                        onClick={() => handleBookingStepAction(step.key)}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/40 bg-surface-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Agenda</p>
                <span className="rounded-md border border-border/40 px-1.5 py-0.5 text-[11px] text-brand-muted">
                  {snapshotQuery.data?.agenda.length ?? 0}
                </span>
              </div>
              {(snapshotQuery.data?.agenda ?? []).slice(0, 3).map((item) => (
                <div key={item.id} className="mb-2 last:mb-0">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="text-xs text-brand-muted">{formatEventRange(item.startTime, item.endTime)}</p>
                </div>
              ))}
              {!snapshotQuery.data?.agenda.length ? <p className="text-xs text-brand-muted">No events scheduled yet.</p> : null}
            </div>

            <div className="rounded-xl border border-border/40 bg-surface-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Open Documents</p>
                <span className="rounded-md border border-border/40 px-1.5 py-0.5 text-[11px] text-brand-muted">
                  {snapshotQuery.data?.openDocuments.length ?? 0}
                </span>
              </div>
              {(snapshotQuery.data?.openDocuments ?? []).slice(0, 4).map((item) => (
                <div key={item.id} className="mb-2 last:mb-0">
                  <p className="text-sm font-medium text-white">{formatDocumentType(item.type)}</p>
                  <p className="text-xs text-brand-muted">
                    {item.status.replaceAll('_', ' ')} • {new Date(item.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
              {!snapshotQuery.data?.openDocuments.length ? <p className="text-xs text-brand-muted">No open documents.</p> : null}
            </div>
          </div>
        ) : null}
      </Card>

      <LeadTasksCard lead={lead} />
    </div>

    <LeadActivityFeedCard lead={lead} onSelectTab={onSelectTab} />
  </div>
)
}

interface ContactEditorProps {
  values: ContactEditorValues
  onChange: (values: ContactEditorValues) => void
  onSubmit: () => void
  submitLabel: string
  isSubmitting: boolean
}

function ContactEditor({ values, onChange, onSubmit, submitLabel, isSubmitting }: ContactEditorProps) {
  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={INPUT_CLASS}
          value={values.name}
          onChange={(event) => onChange({ ...values, name: event.target.value })}
          placeholder="Contact name"
        />
        <select
          className="select-compact w-full"
          value={values.role}
          onChange={(event) => onChange({ ...values, role: event.target.value as LeadContactRole })}
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={INPUT_CLASS}
          value={values.phone}
          onChange={(event) => onChange({ ...values, phone: event.target.value })}
          placeholder="Phone"
        />
        <input
          className={INPUT_CLASS}
          value={values.email}
          onChange={(event) => onChange({ ...values, email: event.target.value })}
          placeholder="Email"
        />
      </div>
      <textarea
        rows={2}
        className={INPUT_CLASS}
        value={values.notes}
        onChange={(event) => onChange({ ...values, notes: event.target.value })}
        placeholder="Notes"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting || !values.name.trim()}
        className="btn-compact-primary w-fit"
      >
        {isSubmitting ? 'Saving…' : submitLabel}
      </button>
    </div>
  )
}

function initialContactValues(): ContactEditorValues {
  return {
    name: '',
    role: 'other',
    email: '',
    phone: '',
    notes: '',
  }
}

function normalizeEditableRole(role: LeadContactRecord['role']): LeadContactRole {
  if (
    role === 'bride' ||
    role === 'groom' ||
    role === 'parent' ||
    role === 'venue_coordinator' ||
    role === 'wedding_planner' ||
    role === 'vendor' ||
    role === 'other'
  ) {
    return role
  }

  return 'other'
}

function formatContactRole(role: LeadContactRecord['role']) {
  if (role === 'primary_client') return 'Client'
  if (role === 'venue_coordinator') return 'Venue'
  if (role === 'wedding_planner') return 'Planner'
  return role.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatContactTag(source: LeadContactRecord['source']) {
  if (source === 'lead') return 'client'
  if (source === 'address_book') return 'address book'
  return 'legacy'
}

function formatVenueLocation(input?: {
  addressLine1?: string
  addressLine2?: string
  city?: string
  stateProvince?: string
  postalCode?: string
  country?: string
}) {
  if (!input) return ''
  const line1 = [input.addressLine1, input.addressLine2].filter(Boolean).join(', ')
  const line2 = [input.city, input.stateProvince, input.postalCode].filter(Boolean).join(', ')
  return [line1, line2, input.country].filter(Boolean).join(' | ')
}

function formatVenueLocationKind(kind: LeadVenueLocationKind) {
  if (kind === 'bridal_session') return 'Bridal Session'
  return kind.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDocumentType(type: 'questionnaire' | 'contract' | 'invoice') {
  if (type === 'questionnaire') return 'Questionnaire'
  if (type === 'contract') return 'Contract'
  return 'Invoice'
}

function formatEventRange(startTime: string | null, endTime: string | null) {
  if (!startTime) return 'Date pending'
  const start = new Date(startTime)
  const end = endTime ? new Date(endTime) : null
  const startLabel = `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (!end) return startLabel
  const endLabel = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${startLabel} - ${endLabel}`
}
