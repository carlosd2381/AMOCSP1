import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronUp, ChevronsUpDown, Eye, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useBranding } from '@/contexts/BrandingContext'
import { Card } from '@/components/ui/Card'
import {
  createAddressBookContact,
  createEmptyAddressBookProfile,
  deleteAddressBookContact,
  fetchAddressBookContacts,
  updateAddressBookContact,
  type AddressBookLinkedContact,
  type AddressBookProfile,
} from '@/services/addressBookService'

const CONTACT_TYPE_OPTIONS = [
  { value: 'client', label: 'Client' },
  { value: 'venue', label: 'Venue' },
  { value: 'planner', label: 'Planner' },
  { value: 'provider', label: 'Provider' },
  { value: 'employee', label: 'Employee' },
] as const

const ROLE_OPTIONS = [
  'Bride',
  'Groom',
  'Partner A',
  'Partner B',
  'Parent',
  'Family',
  'Best Man',
  'Maid of Honor',
  'Groomsmen',
  'Bridesmaid',
  'Photographer',
  'Cinematographer',
  'Photo Editor',
  'Video Editor',
  'Assistant',
  'Content Creator',
  'Planner',
  'Coordinator',
  'Hair Stylist',
  'Makeup Artist',
  'Other',
] as const

const SALUTATION_OPTIONS = ['Dr.', 'Miss', 'Mr', 'Mrs', 'Ms', 'Sr.', 'Sra.', 'Srta.'] as const

const GENDER_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'x', label: 'X' },
] as const

const BEST_DAY_OPTIONS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const CONTACT_PREF_OPTIONS = ['Email', 'Phone', 'SMS', 'WhatsApp', 'Instagram', 'No preference'] as const
const RELATIONSHIP_OPTIONS = ['Bride', 'Groom', 'Planner', 'Venue', 'Parent', 'Family', 'Provider', 'Other'] as const
const RECIPROCAL_RELATIONSHIP_OPTIONS = ['Bride', 'Groom', 'Client', 'Planner', 'Venue', 'Child', 'Parent', 'Family', 'Linked', 'Other'] as const

type SortDirection = 'asc' | 'desc'
type AddressSortKey = 'name' | 'type' | 'role' | 'email' | 'mobile' | 'updated'

export function AddressBookPage() {
  const queryClient = useQueryClient()
  const { brand } = useBranding()
  const [searchParams, setSearchParams] = useSearchParams()
  const modeParam = searchParams.get('mode')
  const contactIdParam = searchParams.get('contactId')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<AddressSortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)
  const [suppressDeepLinkOnce, setSuppressDeepLinkOnce] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(() => {
    const mode = modeParam
    return mode === 'create' || mode === 'edit' ? mode : null
  })
  const [editingContactId, setEditingContactId] = useState<string | null>(() => contactIdParam)
  const [draft, setDraft] = useState<AddressBookProfile>(createEmptyAddressBookProfile())

  const contactsQuery = useQuery({
    queryKey: ['address-book', brand.slug],
    queryFn: () => fetchAddressBookContacts(brand.slug),
  })

  const contacts = useMemo(() => contactsQuery.data ?? [], [contactsQuery.data])

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts
    const query = search.trim().toLowerCase()
    return contacts.filter((contact) => {
      const haystack = [
        contact.displayName,
        contact.profile.primaryEmail,
        contact.profile.mobilePhone,
        contact.profile.companyName,
        contact.profile.role,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [contacts, search])

  const sortedContacts = useMemo(() => {
    const next = [...filteredContacts]

    next.sort((a, b) => {
      const directionFactor = sortDirection === 'asc' ? 1 : -1

      if (sortKey === 'name') return a.displayName.localeCompare(b.displayName) * directionFactor
      if (sortKey === 'type') return a.profile.contactType.localeCompare(b.profile.contactType) * directionFactor
      if (sortKey === 'role') return (a.profile.role || '').localeCompare(b.profile.role || '') * directionFactor
      if (sortKey === 'email') return (a.profile.primaryEmail || '').localeCompare(b.profile.primaryEmail || '') * directionFactor
      if (sortKey === 'mobile') return (a.profile.mobilePhone || '').localeCompare(b.profile.mobilePhone || '') * directionFactor

      const aTime = new Date(a.updatedAt).getTime() || 0
      const bTime = new Date(b.updatedAt).getTime() || 0
      return (aTime - bTime) * directionFactor
    })

    return next
  }, [filteredContacts, sortDirection, sortKey])

  const selectedContact = useMemo(() => contacts.find((contact) => contact.id === editingContactId) ?? null, [contacts, editingContactId])
  const deleteTarget = useMemo(() => contacts.find((contact) => contact.id === deleteContactId) ?? null, [contacts, deleteContactId])
  const linkableContacts = useMemo(
    () => contacts.filter((contact) => contact.id !== editingContactId),
    [contacts, editingContactId],
  )

  useEffect(() => {
    if (suppressDeepLinkOnce) {
      if (!modeParam) {
        setSuppressDeepLinkOnce(false)
      }
      return undefined
    }

    if (modeParam === 'create' && editorMode !== 'create') {
      const timer = window.setTimeout(() => {
        openCreate(false)
      }, 0)
      return () => window.clearTimeout(timer)
    }

    if (modeParam === 'edit' && contactIdParam && (editorMode !== 'edit' || editingContactId !== contactIdParam)) {
      const timer = window.setTimeout(() => {
        openEdit(contactIdParam, false)
      }, 0)
      return () => window.clearTimeout(timer)
    }

    return undefined
  }, [modeParam, contactIdParam, editorMode, editingContactId, contacts, suppressDeepLinkOnce])

  const createMutation = useMutation({
    mutationFn: () => createAddressBookContact(brand.slug, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['address-book', brand.slug] })
      toast.success('Contact created')
      closeEditor()
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to create contact')
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedContact) throw new Error('Select a contact first')
      return updateAddressBookContact(selectedContact.id, draft)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['address-book', brand.slug] })
      toast.success('Contact updated')
      closeEditor()
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to update contact')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!selectedContact) throw new Error('Select a contact first')
      return deleteAddressBookContact(selectedContact.id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['address-book', brand.slug] })
      toast.success('Contact removed')
      closeEditor()
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to remove contact')
    },
  })

  const rowDeleteMutation = useMutation({
    mutationFn: (contactId: string) => deleteAddressBookContact(contactId),
    onSuccess: async (_result, deletedContactId) => {
      await queryClient.invalidateQueries({ queryKey: ['address-book', brand.slug] })
      toast.success('Contact removed')
      if (editingContactId === deletedContactId) {
        closeEditor()
      }
      setDeleteContactId(null)
      setDeleteStep(1)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to remove contact')
    },
  })

  const openCreate = (syncUrl = true) => {
    setEditorMode('create')
    setEditingContactId(null)
    setDraft(createEmptyAddressBookProfile())
    if (syncUrl) {
      setSearchParams({ mode: 'create' }, { replace: true })
    }
  }

  const openEdit = (contactId: string, syncUrl = true) => {
    const contact = contacts.find((item) => item.id === contactId)
    if (!contact) return
    setEditorMode('edit')
    setEditingContactId(contactId)
    setDraft(contact.profile)
    if (syncUrl) {
      setSearchParams({ mode: 'edit', contactId }, { replace: true })
    }
  }

  function closeEditor() {
    setSuppressDeepLinkOnce(true)
    setSearchParams({}, { replace: true })
    setEditorMode(null)
    setEditingContactId(null)
    setDraft(createEmptyAddressBookProfile())
  }

  const saveContact = async () => {
    if (!draft.firstName.trim() && !draft.lastNamePaternal.trim() && !draft.companyName.trim()) {
      toast.error('Add at least a first name, last name, or company')
      return
    }

    if (editorMode === 'edit' && selectedContact) {
      await updateMutation.mutateAsync()
      return
    }

    await createMutation.mutateAsync()
  }

  const toggleSort = (key: AddressSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <div className="space-y-4">
      <Card title="Address Book" className="p-4" actions={<span className="text-xs text-brand-muted"># {sortedContacts.length} Total</span>}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search contacts"
              className="input-compact w-full"
            />
            <button type="button" onClick={() => openCreate()} className="btn-compact-primary inline-flex items-center gap-1">
              <Plus size={14} /> New
            </button>
          </div>

          {contactsQuery.isLoading ? <p className="text-sm text-brand-muted">Loading contacts…</p> : null}

          <div className="overflow-x-auto border border-border/40">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/40 bg-surface-muted/30 text-xs uppercase tracking-[0.14em] text-brand-muted">
                  <th className="px-3 py-2">{renderSortableHeader('Name', 'name', sortKey, sortDirection, toggleSort)}</th>
                  <th className="px-3 py-2">{renderSortableHeader('Type', 'type', sortKey, sortDirection, toggleSort)}</th>
                  <th className="px-3 py-2">{renderSortableHeader('Role', 'role', sortKey, sortDirection, toggleSort)}</th>
                  <th className="px-3 py-2">{renderSortableHeader('Primary Email', 'email', sortKey, sortDirection, toggleSort)}</th>
                  <th className="px-3 py-2">{renderSortableHeader('Mobile Phone', 'mobile', sortKey, sortDirection, toggleSort)}</th>
                  <th className="px-3 py-2">{renderSortableHeader('Updated', 'updated', sortKey, sortDirection, toggleSort)}</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!sortedContacts.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-5 text-sm text-brand-muted">No contacts found.</td>
                  </tr>
                ) : null}
                {sortedContacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-border/20 text-sm text-white last:border-b-0 hover:bg-surface-muted/20">
                    <td className="px-3 py-2 font-medium">{contact.displayName}</td>
                    <td className="px-3 py-2 capitalize text-brand-muted">{contact.profile.contactType}</td>
                    <td className="px-3 py-2 text-brand-muted">{contact.profile.role || '-'}</td>
                    <td className="px-3 py-2 text-brand-muted">{contact.profile.primaryEmail || '-'}</td>
                    <td className="px-3 py-2 text-brand-muted">{contact.profile.mobilePhone || '-'}</td>
                    <td className="px-3 py-2 text-brand-muted">{new Date(contact.updatedAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(contact.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          title="View contact"
                          aria-label={`View ${contact.displayName}`}
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(contact.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          title="Edit contact"
                          aria-label={`Edit ${contact.displayName}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteContactId(contact.id)
                            setDeleteStep(1)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/40 text-rose-300 transition hover:border-rose-400 hover:text-rose-200"
                          title="Delete contact"
                          aria-label={`Delete ${contact.displayName}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {deleteContactId && deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl border border-border/60 bg-surface p-4 shadow-card">
            {deleteStep === 1 ? (
              <>
                <h3 className="text-lg font-semibold text-white">Delete Contact</h3>
                <p className="mt-2 text-sm text-brand-muted">
                  You are about to delete <span className="text-white">{deleteTarget.displayName}</span>. This action cannot be undone.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteContactId(null)
                      setDeleteStep(1)
                    }}
                    className="btn-compact-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteStep(2)}
                    className="btn-compact-primary"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-white">Final Confirmation</h3>
                <p className="mt-2 text-sm text-brand-muted">
                  Deleting this contact removes links from related address book profiles and lead/venue references.
                </p>

                {deleteTarget.profile.linkedContacts.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                    Warning: {deleteTarget.profile.linkedContacts.length} linked contact relationship(s) will be removed.
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteStep(1)}
                    className="btn-compact-secondary"
                    disabled={rowDeleteMutation.isPending}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={rowDeleteMutation.isPending}
                    onClick={() => rowDeleteMutation.mutate(deleteContactId)}
                    className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/20 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-rose-100 hover:bg-rose-500/30 disabled:opacity-60"
                  >
                    {rowDeleteMutation.isPending ? 'Deleting...' : 'Delete Contact'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <AddressBookEditorModal
        open={editorMode !== null}
        title={editorMode === 'edit' ? 'Edit Contact' : 'New Contact'}
        onClose={closeEditor}
        onSave={saveContact}
        isSaving={createMutation.isPending || updateMutation.isPending}
        canRemove={editorMode === 'edit' && Boolean(selectedContact)}
        onRemove={() => deleteMutation.mutate()}
        isRemoving={deleteMutation.isPending}
      >
        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-[0.16em] text-brand-muted">Identity</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <SelectField
                label="Contact Type"
                value={draft.contactType}
                onChange={(value) => setDraft((current) => ({ ...current, contactType: value as AddressBookProfile['contactType'] }))}
                options={CONTACT_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              />
              <SelectField
                label="Role"
                value={draft.role}
                onChange={(value) => setDraft((current) => ({ ...current, role: value }))}
                options={[{ value: '', label: 'Select role' }, ...ROLE_OPTIONS.map((role) => ({ value: role, label: role }))]}
              />
              <SelectField
                label="Salutation"
                value={draft.salutation}
                onChange={(value) => setDraft((current) => ({ ...current, salutation: value }))}
                options={[{ value: '', label: 'Select salutation' }, ...SALUTATION_OPTIONS.map((value) => ({ value, label: value }))]}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <InputField label="First Name" value={draft.firstName} onChange={(value) => setDraft((current) => ({ ...current, firstName: value }))} />
              <InputField label="Middle Name" value={draft.middleName} onChange={(value) => setDraft((current) => ({ ...current, middleName: value }))} />
              <InputField
                label="Last Name (Paternal)"
                value={draft.lastNamePaternal}
                onChange={(value) => setDraft((current) => ({ ...current, lastNamePaternal: value }))}
              />
              <InputField
                label="Last Name (Maternal)"
                value={draft.lastNameMaternal}
                onChange={(value) => setDraft((current) => ({ ...current, lastNameMaternal: value }))}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                label="Gender"
                value={draft.gender}
                onChange={(value) => setDraft((current) => ({ ...current, gender: value as AddressBookProfile['gender'] }))}
                options={GENDER_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              />
              <InputField
                label="Birthday"
                type="date"
                value={draft.birthday}
                onChange={(value) => setDraft((current) => ({ ...current, birthday: value }))}
              />
              <InputField
                label="Anniversary"
                type="date"
                value={draft.anniversary}
                onChange={(value) => setDraft((current) => ({ ...current, anniversary: value }))}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-[0.16em] text-brand-muted">Address</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <InputField label="Address Line 1" value={draft.addressLine1} onChange={(value) => setDraft((current) => ({ ...current, addressLine1: value }))} />
              <InputField label="Address Line 2" value={draft.addressLine2} onChange={(value) => setDraft((current) => ({ ...current, addressLine2: value }))} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <InputField label="City/Town" value={draft.cityTown} onChange={(value) => setDraft((current) => ({ ...current, cityTown: value }))} />
              <InputField
                label="State/Province"
                value={draft.stateProvince}
                onChange={(value) => setDraft((current) => ({ ...current, stateProvince: value }))}
              />
              <InputField
                label="Zip/Postal Code"
                value={draft.postalCode}
                onChange={(value) => setDraft((current) => ({ ...current, postalCode: value }))}
              />
              <InputField label="Country" value={draft.country} onChange={(value) => setDraft((current) => ({ ...current, country: value }))} />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-[0.16em] text-brand-muted">Contact Channels</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <InputField
                label="Primary Email"
                type="email"
                value={draft.primaryEmail}
                onChange={(value) => setDraft((current) => ({ ...current, primaryEmail: value }))}
              />
              <InputField
                label="Secondary Email"
                type="email"
                value={draft.secondaryEmail}
                onChange={(value) => setDraft((current) => ({ ...current, secondaryEmail: value }))}
              />
              <InputField
                label="Mobile Phone"
                value={draft.mobilePhone}
                onChange={(value) => setDraft((current) => ({ ...current, mobilePhone: value }))}
              />
              <InputField label="Home Phone" value={draft.homePhone} onChange={(value) => setDraft((current) => ({ ...current, homePhone: value }))} />
              <InputField label="Work Phone" value={draft.workPhone} onChange={(value) => setDraft((current) => ({ ...current, workPhone: value }))} />
              <InputField
                label="Work Extension"
                value={draft.workExtension}
                onChange={(value) => setDraft((current) => ({ ...current, workExtension: value }))}
              />
              <InputField
                label="Best Time to Call"
                value={draft.bestTimeToCall}
                onChange={(value) => setDraft((current) => ({ ...current, bestTimeToCall: value }))}
              />
              <SelectField
                label="Best Day to Call"
                value={draft.bestDayToCall}
                onChange={(value) => setDraft((current) => ({ ...current, bestDayToCall: value }))}
                options={[{ value: '', label: 'Select day' }, ...BEST_DAY_OPTIONS.map((day) => ({ value: day, label: day }))]}
              />
              <SelectField
                label="Contact Preference"
                value={draft.contactPreference}
                onChange={(value) => setDraft((current) => ({ ...current, contactPreference: value }))}
                options={[{ value: '', label: 'Select preference' }, ...CONTACT_PREF_OPTIONS.map((value) => ({ value, label: value }))]}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleField
                label="Require Strict Privacy"
                checked={draft.strictPrivacy}
                onChange={(checked) => setDraft((current) => ({ ...current, strictPrivacy: checked }))}
              />
              <ToggleField
                label="Opted-In to Marketing and Processing"
                checked={draft.optedInMarketing}
                onChange={(checked) => setDraft((current) => ({ ...current, optedInMarketing: checked }))}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-[0.16em] text-brand-muted">Work Info</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <InputField
                label="Company Name"
                value={draft.companyName}
                onChange={(value) => setDraft((current) => ({ ...current, companyName: value }))}
              />
              <InputField label="Position" value={draft.position} onChange={(value) => setDraft((current) => ({ ...current, position: value }))} />
              <InputField
                label="Work Address"
                value={draft.workAddress}
                onChange={(value) => setDraft((current) => ({ ...current, workAddress: value }))}
              />
              <InputField label="Website" value={draft.website} onChange={(value) => setDraft((current) => ({ ...current, website: value }))} />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-[0.16em] text-brand-muted">Social Networks & Chats</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <InputField label="Facebook" value={draft.facebook} onChange={(value) => setDraft((current) => ({ ...current, facebook: value }))} />
              <InputField label="Instagram" value={draft.instagram} onChange={(value) => setDraft((current) => ({ ...current, instagram: value }))} />
              <InputField label="TikTok" value={draft.tiktok} onChange={(value) => setDraft((current) => ({ ...current, tiktok: value }))} />
              <InputField label="Pinterest" value={draft.pinterest} onChange={(value) => setDraft((current) => ({ ...current, pinterest: value }))} />
              <InputField label="LinkedIn" value={draft.linkedIn} onChange={(value) => setDraft((current) => ({ ...current, linkedIn: value }))} />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-[0.16em] text-brand-muted">Linked Contacts</h3>
            <div className="space-y-2">
              {!draft.linkedContacts.length ? <p className="text-xs text-brand-muted">No linked contacts yet.</p> : null}

              {draft.linkedContacts.map((link, index) => (
                <div key={`${index}-${link.contactId}`} className="grid gap-2 border border-border/40 bg-surface-muted/20 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <SelectField
                    label="Relationship"
                    value={link.relationship}
                    onChange={(value) => updateLinkedContact(index, { ...link, relationship: value })}
                    options={[{ value: '', label: 'Select relationship' }, ...RELATIONSHIP_OPTIONS.map((value) => ({ value, label: value }))]}
                  />
                  <SelectField
                    label="Reciprocal"
                    value={link.reciprocalRelationship ?? ''}
                    onChange={(value) => updateLinkedContact(index, { ...link, reciprocalRelationship: value })}
                    options={[
                      { value: '', label: 'Auto' },
                      ...RECIPROCAL_RELATIONSHIP_OPTIONS.map((value) => ({ value, label: value })),
                    ]}
                  />
                  <SelectField
                    label="Contact"
                    value={link.contactId}
                    onChange={(value) => updateLinkedContact(index, { ...link, contactId: value })}
                    options={[
                      { value: '', label: 'Select contact' },
                      ...linkableContacts.map((contact) => ({ value: contact.id, label: contact.displayName })),
                    ]}
                  />
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeLinkedContact(index)}
                      className="btn-compact-secondary inline-flex items-center gap-1"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => addLinkedContact()}
                className="btn-compact-secondary inline-flex items-center gap-1"
              >
                <Plus size={13} /> Add Linked Contact
              </button>
            </div>
          </section>
        </div>
      </AddressBookEditorModal>
    </div>
  )

  function addLinkedContact() {
    setDraft((current) => ({
      ...current,
      linkedContacts: [...current.linkedContacts, { contactId: '', relationship: '', reciprocalRelationship: '' }],
    }))
  }

  function updateLinkedContact(index: number, next: AddressBookLinkedContact) {
    setDraft((current) => ({
      ...current,
      linkedContacts: current.linkedContacts.map((item, itemIndex) => (itemIndex === index ? next : item)),
    }))
  }

  function removeLinkedContact(index: number) {
    setDraft((current) => ({
      ...current,
      linkedContacts: current.linkedContacts.filter((_, itemIndex) => itemIndex !== index),
    }))
  }
}

function renderSortableHeader(
  label: string,
  key: AddressSortKey,
  activeKey: AddressSortKey,
  direction: SortDirection,
  onToggle: (key: AddressSortKey) => void,
) {
  const isActive = activeKey === key

  return (
    <button
      type="button"
      onClick={() => onToggle(key)}
      className="inline-flex items-center gap-1 text-inherit transition hover:text-white"
    >
      <span>{label}</span>
      {isActive ? (direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={12} />}
    </button>
  )
}

function AddressBookEditorModal({
  open,
  title,
  onClose,
  onSave,
  isSaving,
  canRemove,
  onRemove,
  isRemoving,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  onSave: () => void
  isSaving: boolean
  canRemove: boolean
  onRemove: () => void
  isRemoving: boolean
  children: ReactNode
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-6xl border border-border/60 bg-surface p-4 shadow-card">
        <header className="mb-3 flex items-center justify-between border-b border-border/30 pb-3">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center border border-border/60 text-brand-muted hover:border-border hover:text-white"
            aria-label="Close editor"
          >
            <X size={14} />
          </button>
        </header>

        <div className="max-h-[72vh] overflow-y-auto pr-1">{children}</div>

        <footer className="mt-4 flex items-center justify-end gap-2 border-t border-border/30 pt-3">
          {canRemove ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={isRemoving}
              className="btn-compact-secondary inline-flex items-center gap-1"
            >
              <Trash2 size={13} /> Remove
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="btn-compact-secondary">Cancel</button>
          <button type="button" onClick={onSave} disabled={isSaving} className="btn-compact-primary">
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="input-compact w-full" />
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="select-compact w-full">
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 border border-border/40 bg-surface-muted/20 px-3 py-2 text-xs text-brand-muted">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  )
}
