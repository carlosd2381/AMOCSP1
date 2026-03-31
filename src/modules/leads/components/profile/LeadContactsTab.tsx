import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { type LeadRecord } from '@/types'
import {
  createLeadContact,
  deleteLeadContact,
  fetchLeadContacts,
  moveLeadContact,
  updateLeadContact,
  type LeadContactRecord,
  type LeadContactRole,
} from '@/services/leadContactsService'

interface LeadContactsTabProps {
  lead: LeadRecord
}

interface ContactFormValues {
  name: string
  role: LeadContactRole
  email: string
  phone: string
  notes: string
}

const INPUT_CLASS = 'input-compact w-full'

const ROLE_OPTIONS: Array<{ value: LeadContactRole; label: string }> = [
  { value: 'bride', label: 'Bride' },
  { value: 'groom', label: 'Groom' },
  { value: 'parent', label: 'Parent' },
  { value: 'venue_coordinator', label: 'Venue Coordinator' },
  { value: 'wedding_planner', label: 'Wedding Planner' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'other', label: 'Other' },
]

export function LeadContactsTab({ lead }: LeadContactsTabProps) {
  const queryClient = useQueryClient()
  const [newContact, setNewContact] = useState<ContactFormValues>(initialContactValues())
  const [editingContactId, setEditingContactId] = useState<string | null>(null)
  const [editingContact, setEditingContact] = useState<ContactFormValues>(initialContactValues())

  const contactsQuery = useQuery({
    queryKey: ['lead-contacts', lead.id],
    queryFn: () => fetchLeadContacts(lead),
  })

  const customContacts = useMemo(
    () =>
      (contactsQuery.data ?? [])
        .filter((contact) => contact.source === 'address_book')
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [contactsQuery.data],
  )

  const autoContacts = useMemo(
    () => (contactsQuery.data ?? []).filter((contact) => contact.source !== 'address_book'),
    [contactsQuery.data],
  )

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
      queryClient.invalidateQueries({ queryKey: ['lead-contacts', lead.id] })
      toast.success('Contact removed')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to remove contact')
    },
  })

  const moveMutation = useMutation({
    mutationFn: ({ contactId, direction }: { contactId: string; direction: 'up' | 'down' }) =>
      moveLeadContact(lead.id, contactId, direction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-contacts', lead.id] })
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to reorder contact')
    },
  })

  const setVenueMutation = useMutation({
    mutationFn: (contact: LeadContactRecord) =>
      updateLeadContact({
        leadId: lead.id,
        contactId: contact.id,
        role: 'venue_coordinator',
        name: contact.name,
        email: contact.email ?? '',
        phone: contact.phone ?? '',
        notes: contact.notes ?? '',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-contacts', lead.id] })
      toast.success('Venue assigned')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to set venue contact')
    },
  })

  return (
    <div className="space-y-4">
      <Card title="Contacts" className="p-4">
        <div className="space-y-3">
          <ContactForm
            values={newContact}
            onChange={setNewContact}
            onSubmit={() => createMutation.mutate()}
            submitLabel="Add Contact"
            isSubmitting={createMutation.isPending}
          />

          {contactsQuery.isLoading ? <p className="text-sm text-brand-muted">Loading contacts…</p> : null}

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Primary Contacts</p>
            {!autoContacts.length ? <p className="text-sm text-brand-muted">No linked contacts yet.</p> : null}
            {autoContacts.map((contact) => (
              <article key={contact.id} className="rounded-xl border border-border/40 bg-surface-muted/40 p-3">
                <ContactHeader contact={contact} />
                <ContactDetails contact={contact} />
              </article>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Event Contacts</p>
            {!customContacts.length ? (
              <p className="text-sm text-brand-muted">No custom contacts yet. Add venue, family, and vendor contacts above.</p>
            ) : null}
            {customContacts.map((contact, index) => {
              const isEditing = editingContactId === contact.id
              const isFirst = index === 0
              const isLast = index === customContacts.length - 1
              return (
                <article key={contact.id} className="rounded-xl border border-border/40 bg-surface-muted/40 p-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      <ContactForm
                        values={editingContact}
                        onChange={setEditingContact}
                        onSubmit={() => updateMutation.mutate()}
                        submitLabel="Save"
                        isSubmitting={updateMutation.isPending}
                        compact
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
                    <>
                      <ContactHeader contact={contact} />
                      <ContactDetails contact={contact} />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {contact.role !== 'venue_coordinator' ? (
                          <button
                            type="button"
                            onClick={() => setVenueMutation.mutate(contact)}
                            disabled={setVenueMutation.isPending}
                            className="btn-compact-primary"
                          >
                            Set as Venue
                          </button>
                        ) : (
                          <span className="rounded-xl border border-brand-primary/40 bg-brand-primary/10 px-2 py-1 text-xs text-white">
                            Venue
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => moveMutation.mutate({ contactId: contact.id, direction: 'up' })}
                          disabled={moveMutation.isPending || isFirst}
                          className="btn-compact-secondary"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveMutation.mutate({ contactId: contact.id, direction: 'down' })}
                          disabled={moveMutation.isPending || isLast}
                          className="btn-compact-secondary"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingContactId(contact.id)
                            setEditingContact({
                              name: contact.name,
                              role: normalizeEditableRole(contact),
                              email: contact.email ?? '',
                              phone: contact.phone ?? '',
                              notes: contact.notes ?? '',
                            })
                          }}
                          className="btn-compact-secondary"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(contact.id)}
                          className="btn-compact-secondary"
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      </Card>
    </div>
  )
}

function ContactForm({
  values,
  onChange,
  onSubmit,
  submitLabel,
  isSubmitting,
  compact = false,
}: {
  values: ContactFormValues
  onChange: (values: ContactFormValues) => void
  onSubmit: () => void
  submitLabel: string
  isSubmitting: boolean
  compact?: boolean
}) {
  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={values.name}
          onChange={(event) => onChange({ ...values, name: event.target.value })}
          className={INPUT_CLASS}
          placeholder="Contact name"
        />
        <select
          value={values.role}
          onChange={(event) => onChange({ ...values, role: event.target.value as LeadContactRole })}
          className="select-compact w-full"
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
          value={values.email}
          onChange={(event) => onChange({ ...values, email: event.target.value })}
          className={INPUT_CLASS}
          placeholder="Email (optional)"
        />
        <input
          value={values.phone}
          onChange={(event) => onChange({ ...values, phone: event.target.value })}
          className={INPUT_CLASS}
          placeholder="Phone (optional)"
        />
      </div>
      <textarea
        rows={compact ? 2 : 3}
        value={values.notes}
        onChange={(event) => onChange({ ...values, notes: event.target.value })}
        className={INPUT_CLASS}
        placeholder="Notes (optional)"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting || !values.name.trim()}
        className="btn-compact-primary w-fit"
      >
        {submitLabel}
      </button>
    </div>
  )
}

function ContactHeader({ contact }: { contact: LeadContactRecord }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold text-white">{contact.name}</p>
      <span className="rounded-xl border border-border/40 bg-surface/70 px-2 py-1 text-xs text-brand-muted">{formatRole(contact.role)}</span>
    </div>
  )
}

function ContactDetails({ contact }: { contact: LeadContactRecord }) {
  return (
    <div className="mt-1 space-y-1">
      {contact.email ? <p className="text-xs text-brand-muted">{contact.email}</p> : null}
      {contact.phone ? <p className="text-xs text-brand-muted">{contact.phone}</p> : null}
      {contact.eventTitle ? <p className="text-xs text-brand-muted">Event: {contact.eventTitle}</p> : null}
      {contact.notes ? <p className="text-xs text-brand-muted">{contact.notes}</p> : null}
    </div>
  )
}

function formatRole(role: LeadContactRecord['role']) {
  switch (role) {
    case 'primary_client':
      return 'Primary Client'
    case 'planner':
      return 'Planner'
    case 'venue_coordinator':
      return 'Venue Coordinator'
    case 'wedding_planner':
      return 'Wedding Planner'
    default:
      return role.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }
}

function normalizeEditableRole(contact: LeadContactRecord): LeadContactRole {
  if (contact.role === 'primary_client' || contact.role === 'planner') {
    return 'other'
  }

  return contact.role
}

function initialContactValues(): ContactFormValues {
  return {
    name: '',
    role: 'other',
    email: '',
    phone: '',
    notes: '',
  }
}
