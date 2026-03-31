import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import {
  addVenueTeamContact,
  fetchVenueAssignedClients,
  fetchVenueProfileById,
  fetchVenueTeamContactOptions,
  fetchVenueTeamContacts,
  removeVenueTeamContact,
  updateVenueProfile,
  type VenueTeamRole,
} from '@/services/leadVenueService'

function formatLocation(input: {
  addressLine1?: string
  addressLine2?: string
  city?: string
  stateProvince?: string
  postalCode?: string
  country?: string
}) {
  const line1 = [input.addressLine1, input.addressLine2].filter(Boolean).join(', ')
  const line2 = [input.city, input.stateProvince, input.postalCode].filter(Boolean).join(', ')
  const line3 = input.country
  return [line1, line2, line3].filter(Boolean).join(' | ')
}

export function VenueProfilePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { venueId } = useParams<{ venueId: string }>()
  const [contactId, setContactId] = useState('')
  const [role, setRole] = useState<VenueTeamRole>('coordinator')
  const [isEditVenueOpen, setIsEditVenueOpen] = useState(false)
  const [exportStartDate, setExportStartDate] = useState('')
  const [exportEndDate, setExportEndDate] = useState('')

  const venueQuery = useQuery({
    queryKey: ['venue-profile', venueId],
    queryFn: async () => {
      if (!venueId) throw new Error('Missing venue id')
      return fetchVenueProfileById(venueId)
    },
    enabled: Boolean(venueId),
  })

  const teamQuery = useQuery({
    queryKey: ['venue-profile', venueId, 'team'],
    queryFn: async () => {
      if (!venueId) return []
      return fetchVenueTeamContacts(venueId)
    },
    enabled: Boolean(venueId),
  })

  const assignedClientsQuery = useQuery({
    queryKey: ['venue-profile', venueId, 'clients'],
    queryFn: async () => {
      if (!venueId) return []
      return fetchVenueAssignedClients(venueId)
    },
    enabled: Boolean(venueId),
  })

  const contactOptionsQuery = useQuery({
    queryKey: ['venue-profile', venueId, 'team-options', venueQuery.data?.brandId],
    queryFn: async () => {
      if (!venueQuery.data?.brandId) return []
      return fetchVenueTeamContactOptions({ brandId: venueQuery.data.brandId })
    },
    enabled: Boolean(venueQuery.data?.brandId),
  })

  const addTeamMutation = useMutation({
    mutationFn: async () => {
      if (!venueId || !contactId) return
      return addVenueTeamContact({
        venueProfileId: venueId,
        contactId,
        role,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue-profile', venueId, 'team'] })
      toast.success('Venue team member added')
      setContactId('')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to add venue team member')
    },
  })

  const removeTeamMutation = useMutation({
    mutationFn: async (venueTeamContactId: string) => {
      return removeVenueTeamContact(venueTeamContactId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue-profile', venueId, 'team'] })
      toast.success('Venue team member removed')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to remove venue team member')
    },
  })

  const updateVenueMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      if (!venueId) throw new Error('Missing venue id')
      return updateVenueProfile({
        venueProfileId: venueId,
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
          notes: String(formData.get('notes') ?? ''),
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue-profile', venueId] })
      queryClient.invalidateQueries({ queryKey: ['venue-profiles'] })
      toast.success('Venue updated')
      setIsEditVenueOpen(false)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to update venue')
    },
  })

  const groupedTeam = useMemo(() => {
    const all = teamQuery.data ?? []
    return {
      coordinators: all.filter((item) => item.role === 'coordinator'),
      planners: all.filter((item) => item.role === 'planner'),
    }
  }, [teamQuery.data])

  const availableOptions = useMemo(() => {
    const selectedIds = new Set((teamQuery.data ?? []).map((item) => `${item.id}:${item.role}`))
    return (contactOptionsQuery.data ?? []).filter((item) => !selectedIds.has(`${item.id}:${role}`))
  }, [contactOptionsQuery.data, role, teamQuery.data])

  const filteredAssignedClients = assignedClientsQuery.data ?? []

  const exportReadyClients = useMemo(() => {
    return filteredAssignedClients.filter((item) => {
      if (!item.eventDate) {
        return !exportStartDate && !exportEndDate
      }
      if (exportStartDate && item.eventDate < exportStartDate) return false
      if (exportEndDate && item.eventDate > exportEndDate) return false
      return true
    })
  }, [filteredAssignedClients, exportEndDate, exportStartDate])

  const leadStatusSummary = useMemo(() => {
    const summary: Record<string, number> = {
      new: 0,
      contacted: 0,
      proposal: 0,
      contract: 0,
      booked: 0,
      lost: 0,
    }

    for (const item of filteredAssignedClients) {
      summary[item.leadStatus] += 1
    }

    return summary
  }, [filteredAssignedClients])

  const exportAssignedClientsCsv = () => {
    const rows = exportReadyClients
    const headers = ['Client Name', 'Client Email', 'Client Phone', 'Lead Status', 'Event Date', 'Lead Url']
    const body = rows.map((item) => [
      item.clientName,
      item.clientEmail,
      item.clientPhone ?? '',
      item.leadStatus,
      item.eventDate ?? '',
      `${window.location.origin}/leads/${item.leadId}`,
    ])

    const csv = [headers, ...body]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const start = exportStartDate || 'any'
    const end = exportEndDate || 'any'
    link.download = `venue-${venueId}-clients-${start}-to-${end}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (venueQuery.isLoading) {
    return <p className="text-sm text-brand-muted">Loading venue profile...</p>
  }

  if (!venueQuery.data) {
    return (
      <Card title="Venue not found" className="p-4">
        <p className="text-sm text-brand-muted">This venue could not be loaded. It may have been removed.</p>
        <button
          type="button"
          onClick={() => navigate('/venues')}
          className="mt-4 rounded-2xl border border-brand-primary/40 bg-brand-primary/20 px-4 py-2 text-sm text-white"
        >
          Back to venues
        </button>
      </Card>
    )
  }

  const venue = venueQuery.data

  return (
    <div className="space-y-4">
      <Card
        title={<h2 className="text-xl font-semibold text-white">{venue.name}</h2>}
        actions={
          <Link to="/venues" className="btn-compact-secondary">
            Back to Venues
          </Link>
        }
      >
        <p className="text-sm text-brand-muted">
          Updated {new Date(venue.updatedAt).toLocaleDateString()} | {venue.city || 'Unknown city'}, {venue.country || 'Unknown country'}
        </p>
      </Card>

      <Card
        title="Venue Information"
        className="p-4"
        actions={
          <button type="button" onClick={() => setIsEditVenueOpen(true)} className="btn-compact-primary">
            Edit Venue
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/40 bg-surface-muted/20 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Address</p>
            <p className="mt-1 text-sm text-white">{formatLocation(venue) || 'No address entered'}</p>
          </div>
          <div className="rounded-2xl border border-border/40 bg-surface-muted/20 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Email</p>
            <p className="mt-1 text-sm text-white">{venue.email || 'No email entered'}</p>
          </div>
          <div className="rounded-2xl border border-border/40 bg-surface-muted/20 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Phone</p>
            <p className="mt-1 text-sm text-white">{venue.phone || 'No phone entered'}</p>
          </div>
          <div className="rounded-2xl border border-border/40 bg-surface-muted/20 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Website</p>
            <p className="mt-1 text-sm text-white">{venue.website || 'No website entered'}</p>
          </div>
          <div className="rounded-2xl border border-border/40 bg-surface-muted/20 p-3 sm:col-span-2">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-muted">Notes</p>
            <p className="mt-1 text-sm text-white">{venue.notes || 'No notes entered'}</p>
          </div>
        </div>
      </Card>

      {isEditVenueOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl border border-border/60 bg-surface p-4 shadow-card">
            <header className="mb-3 border-b border-border/30 pb-3">
              <h2 className="text-lg font-semibold text-white">Edit Venue</h2>
            </header>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                const formData = new FormData(event.currentTarget)
                updateVenueMutation.mutate(formData)
              }}
              className="grid gap-2"
            >
              <div className="grid gap-2 sm:grid-cols-3">
                <input name="name" defaultValue={venue.name} className="input-compact w-full" placeholder="Venue name" required />
                <input name="resortGroup" defaultValue={venue.resortGroup ?? ''} className="input-compact w-full" placeholder="Resort group" />
                <input name="website" defaultValue={venue.website ?? ''} className="input-compact w-full" placeholder="Website" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <input name="addressLine1" defaultValue={venue.addressLine1 ?? ''} className="input-compact w-full" placeholder="Address line 1" />
                <input name="addressLine2" defaultValue={venue.addressLine2 ?? ''} className="input-compact w-full" placeholder="Address line 2" />
                <input name="city" defaultValue={venue.city ?? ''} className="input-compact w-full" placeholder="City" />
                <input name="stateProvince" defaultValue={venue.stateProvince ?? ''} className="input-compact w-full" placeholder="State / Province" />
                <input name="postalCode" defaultValue={venue.postalCode ?? ''} className="input-compact w-full" placeholder="Postal code" />
                <input name="country" defaultValue={venue.country ?? ''} className="input-compact w-full" placeholder="Country" />
                <input name="phone" defaultValue={venue.phone ?? ''} className="input-compact w-full" placeholder="Phone" />
                <input name="email" type="email" defaultValue={venue.email ?? ''} className="input-compact w-full" placeholder="Email" />
              </div>
              <textarea name="notes" defaultValue={venue.notes ?? ''} rows={3} className="input-compact w-full" placeholder="Notes" />

              <div className="mt-1 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setIsEditVenueOpen(false)} className="btn-compact-secondary">Cancel</button>
                <button type="submit" disabled={updateVenueMutation.isPending} className="btn-compact-primary">
                  {updateVenueMutation.isPending ? 'Saving...' : 'Save Venue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <Card title="Planners / Coordinators" className="p-4">
        <form
          className="mb-3 grid gap-2 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!contactId) {
              toast.error('Select a contact')
              return
            }
            addTeamMutation.mutate()
          }}
        >
          <select value={role} onChange={(event) => setRole(event.target.value as VenueTeamRole)} className="input-compact w-full">
            <option value="coordinator">Coordinator</option>
            <option value="planner">Planner</option>
          </select>
          <select
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
            className="input-compact w-full sm:col-span-2"
          >
            <option value="">Select contact from address book</option>
            {availableOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.displayName}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-compact-primary" disabled={addTeamMutation.isPending}>
            {addTeamMutation.isPending ? 'Adding...' : 'Add'}
          </button>
        </form>

        {teamQuery.isLoading ? <p className="text-sm text-brand-muted">Loading venue team...</p> : null}

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/40 bg-surface-muted/15 p-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-brand-muted">Coordinators</h3>
            <ul className="mt-2 space-y-2">
              {!groupedTeam.coordinators.length ? <li className="text-sm text-brand-muted">No coordinators added.</li> : null}
              {groupedTeam.coordinators.map((member) => (
                <li key={member.venueTeamContactId} className="flex items-start justify-between gap-2 border-b border-border/20 pb-2 text-sm text-white last:border-b-0">
                  <div>
                    <Link className="font-medium text-white underline-offset-2 hover:underline" to={`/address-book?mode=edit&contactId=${member.id}`}>
                      {member.displayName}
                    </Link>
                    <p className="text-xs text-brand-muted">{member.email || member.phone || 'No contact details'}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-compact-secondary"
                    onClick={() => removeTeamMutation.mutate(member.venueTeamContactId)}
                    disabled={removeTeamMutation.isPending}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border/40 bg-surface-muted/15 p-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-brand-muted">Planners</h3>
            <ul className="mt-2 space-y-2">
              {!groupedTeam.planners.length ? <li className="text-sm text-brand-muted">No planners added.</li> : null}
              {groupedTeam.planners.map((member) => (
                <li key={member.venueTeamContactId} className="flex items-start justify-between gap-2 border-b border-border/20 pb-2 text-sm text-white last:border-b-0">
                  <div>
                    <Link className="font-medium text-white underline-offset-2 hover:underline" to={`/address-book?mode=edit&contactId=${member.id}`}>
                      {member.displayName}
                    </Link>
                    <p className="text-xs text-brand-muted">{member.email || member.phone || 'No contact details'}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-compact-secondary"
                    onClick={() => removeTeamMutation.mutate(member.venueTeamContactId)}
                    disabled={removeTeamMutation.isPending}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card
        title={`Clients Using This Venue (${filteredAssignedClients.length})`}
        className="p-4"
        actions={
          <button
            type="button"
            className="btn-compact-secondary"
            onClick={exportAssignedClientsCsv}
            disabled={!exportReadyClients.length}
          >
            Export CSV
          </button>
        }
      >
        {assignedClientsQuery.isLoading ? <p className="text-sm text-brand-muted">Loading assigned clients...</p> : null}

        <div className="mb-3 grid gap-2 lg:grid-cols-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:col-span-2">
            <label className="text-xs text-brand-muted">
              Export start date
              <input type="date" value={exportStartDate} onChange={(event) => setExportStartDate(event.target.value)} className="input-compact mt-1 w-full" />
            </label>
            <label className="text-xs text-brand-muted">
              Export end date
              <input type="date" value={exportEndDate} onChange={(event) => setExportEndDate(event.target.value)} className="input-compact mt-1 w-full" />
            </label>
          </div>
          <div className="rounded-2xl border border-border/40 bg-surface-muted/20 p-2 text-xs text-brand-muted">
            Rows in export: <span className="text-white">{exportReadyClients.length}</span>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {Object.entries(leadStatusSummary).map(([status, count]) => (
            <Link
              key={status}
              to={`/leads?status=${status}`}
              className="rounded-md border border-border/40 px-2 py-1 text-xs uppercase tracking-[0.12em] text-brand-muted hover:border-border/70 hover:text-white"
            >
              {status}: {count}
            </Link>
          ))}
        </div>

        <div className="overflow-x-auto border border-border/40">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border/40 bg-surface-muted/30 text-xs uppercase tracking-[0.14em] text-brand-muted">
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Lead Status</th>
                <th className="px-3 py-2">Event Date</th>
                <th className="px-3 py-2">Open Lead</th>
              </tr>
            </thead>
            <tbody>
              {!filteredAssignedClients.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-sm text-brand-muted">No clients assigned to this venue yet.</td>
                </tr>
              ) : null}
              {filteredAssignedClients.map((item) => (
                <tr key={item.leadId} className="border-b border-border/20 text-sm text-white last:border-b-0">
                  <td className="px-3 py-2">
                    <p className="font-medium">{item.clientName}</p>
                    <p className="text-xs text-brand-muted">{item.clientEmail}</p>
                  </td>
                  <td className="px-3 py-2 text-brand-muted">{item.leadStatus}</td>
                  <td className="px-3 py-2 text-brand-muted">{item.eventDate || '-'}</td>
                  <td className="px-3 py-2">
                    <Link to={`/leads/${item.leadId}`} className="btn-compact-secondary">
                      View Lead
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
