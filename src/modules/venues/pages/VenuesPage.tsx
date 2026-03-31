import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronUp, ChevronsUpDown, Eye, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useBranding } from '@/contexts/BrandingContext'
import {
  createVenueProfile,
  deleteVenueProfile,
  fetchVenueAssignmentStatsByProfile,
  fetchVenueProfileById,
  fetchVenueProfiles,
  updateVenueProfile,
} from '@/services/leadVenueService'

type SortDirection = 'asc' | 'desc'
type VenueSortKey = 'venue' | 'city' | 'clients' | 'updated'

export function VenuesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { brand } = useBranding()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<VenueSortKey>('venue')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null)
  const [deleteVenueId, setDeleteVenueId] = useState<string | null>(null)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)

  const venuesQuery = useQuery({
    queryKey: ['venue-profiles', brand.slug, 'directory'],
    queryFn: () => fetchVenueProfiles({ brandSlug: brand.slug }),
  })

  const assignmentStatsQuery = useQuery({
    queryKey: ['venue-profiles', brand.slug, 'assignment-stats'],
    queryFn: () => fetchVenueAssignmentStatsByProfile({ brandSlug: brand.slug }),
  })

  const editingVenueQuery = useQuery({
    queryKey: ['venue-profile', editingVenueId],
    queryFn: async () => {
      if (!editingVenueId) return null
      return fetchVenueProfileById(editingVenueId)
    },
    enabled: Boolean(editingVenueId),
  })

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return createVenueProfile({
        brandSlug: brand.slug,
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
      queryClient.invalidateQueries({ queryKey: ['venue-profiles', brand.slug] })
      toast.success('Venue added')
      setIsCreateOpen(false)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to create venue')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      if (!editingVenueId) throw new Error('Missing venue id')
      return updateVenueProfile({
        venueProfileId: editingVenueId,
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
      queryClient.invalidateQueries({ queryKey: ['venue-profiles', brand.slug] })
      queryClient.invalidateQueries({ queryKey: ['venue-profile', editingVenueId] })
      toast.success('Venue updated')
      setEditingVenueId(null)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to update venue')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteVenueProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue-profiles', brand.slug] })
      queryClient.invalidateQueries({ queryKey: ['venue-profiles', brand.slug, 'assignment-stats'] })
      toast.success('Venue deleted')
      setDeleteVenueId(null)
      setDeleteStep(1)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to delete venue')
    },
  })

  const filtered = useMemo(() => {
    const venues = venuesQuery.data ?? []
    const query = search.trim().toLowerCase()

    return venues.filter((venue) => {
      if (!query) return true

      const haystack = [venue.name, venue.resortGroup ?? '', venue.city ?? '', venue.country ?? ''].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [venuesQuery.data, search])

  const sorted = useMemo(() => {
    const stats = assignmentStatsQuery.data ?? {}
    const next = [...filtered]

    next.sort((a, b) => {
      const directionFactor = sortDirection === 'asc' ? 1 : -1

      if (sortKey === 'venue') {
        return a.name.localeCompare(b.name) * directionFactor
      }

      if (sortKey === 'city') {
        return (a.city ?? '').localeCompare(b.city ?? '') * directionFactor
      }

      if (sortKey === 'updated') {
        const aTime = new Date(a.updatedAt).getTime() || 0
        const bTime = new Date(b.updatedAt).getTime() || 0
        return (aTime - bTime) * directionFactor
      }

      const aClients = stats[a.id]?.totalClients ?? 0
      const bClients = stats[b.id]?.totalClients ?? 0
      if (bClients !== aClients) {
        return (aClients - bClients) * directionFactor
      }
      return a.name.localeCompare(b.name) * directionFactor
    })

    return next
  }, [assignmentStatsQuery.data, filtered, sortDirection, sortKey])

  const deleteTarget = useMemo(
    () => (venuesQuery.data ?? []).find((venue) => venue.id === deleteVenueId) ?? null,
    [deleteVenueId, venuesQuery.data],
  )

  const deleteTargetClientCount = deleteTarget ? assignmentStatsQuery.data?.[deleteTarget.id]?.totalClients ?? 0 : 0

  const toggleSort = (key: VenueSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <div className="space-y-4">
      <Card title="Venues Directory" className="p-4" actions={<span className="text-xs text-brand-muted"># {filtered.length} Total</span>}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input-compact w-full"
              placeholder="Search venues"
            />
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="btn-compact-primary inline-flex items-center gap-1"
            >
              <Plus size={13} /> Add Venue +
            </button>
          </div>

          {venuesQuery.isLoading ? <p className="text-sm text-brand-muted">Loading venues...</p> : null}

          <div className="overflow-x-auto border border-border/40">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/40 bg-surface-muted/30 text-xs uppercase tracking-[0.14em] text-brand-muted">
                  <th className="px-3 py-2">{renderSortableHeader('Venue', 'venue', sortKey, sortDirection, toggleSort)}</th>
                  <th className="px-3 py-2">{renderSortableHeader('City', 'city', sortKey, sortDirection, toggleSort)}</th>
                  <th className="px-3 py-2">{renderSortableHeader('Clients', 'clients', sortKey, sortDirection, toggleSort)}</th>
                  <th className="px-3 py-2">{renderSortableHeader('Updated', 'updated', sortKey, sortDirection, toggleSort)}</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!filtered.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-5 text-sm text-brand-muted">No venues found.</td>
                  </tr>
                ) : null}
                {sorted.map((venue) => (
                  <tr
                    key={venue.id}
                    className="cursor-pointer border-b border-border/20 text-sm text-white last:border-b-0 hover:bg-surface-muted/20"
                    onClick={() => navigate(`/venues/${venue.id}`)}
                  >
                    <td className="px-3 py-2 font-medium">{venue.name}</td>
                    <td className="px-3 py-2 text-brand-muted">{venue.city ?? '-'}</td>
                    <td className="px-3 py-2 text-brand-muted">{assignmentStatsQuery.data?.[venue.id]?.totalClients ?? 0}</td>
                    <td className="px-3 py-2 text-brand-muted">{new Date(venue.updatedAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(`/venues/${venue.id}`)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          aria-label={`View ${venue.name}`}
                          title="View"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setEditingVenueId(venue.id)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          aria-label={`Edit ${venue.name}`}
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setDeleteVenueId(venue.id)
                            setDeleteStep(1)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/40 text-rose-300 transition hover:border-rose-400 hover:text-rose-200"
                          aria-label={`Delete ${venue.name}`}
                          title="Delete"
                        >
                          <Trash2 size={14} />
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

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl border border-border/60 bg-surface p-4 shadow-card">
            <header className="mb-3 flex items-center justify-between border-b border-border/30 pb-3">
              <h2 className="text-lg font-semibold text-white">New Venue</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center border border-border/60 text-brand-muted hover:border-border hover:text-white"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </header>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                const formData = new FormData(event.currentTarget)
                createMutation.mutate(formData)
              }}
              className="grid gap-2"
            >
              <div className="grid gap-2 sm:grid-cols-3">
                <input name="name" className="input-compact w-full" placeholder="Venue name" required />
                <input name="resortGroup" className="input-compact w-full" placeholder="Resort group" />
                <input name="website" className="input-compact w-full" placeholder="Website" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <input name="addressLine1" className="input-compact w-full" placeholder="Address line 1" />
                <input name="addressLine2" className="input-compact w-full" placeholder="Address line 2" />
                <input name="city" className="input-compact w-full" placeholder="City" />
                <input name="stateProvince" className="input-compact w-full" placeholder="State / Province" />
                <input name="postalCode" className="input-compact w-full" placeholder="Postal code" />
                <input name="country" className="input-compact w-full" placeholder="Country" />
                <input name="phone" className="input-compact w-full" placeholder="Phone" />
                <input name="email" type="email" className="input-compact w-full" placeholder="Email" />
              </div>
              <textarea name="notes" rows={3} className="input-compact w-full" placeholder="Notes" />

              <div className="mt-1 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="btn-compact-secondary">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="btn-compact-primary">
                  {createMutation.isPending ? 'Saving…' : 'Create Venue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingVenueId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl border border-border/60 bg-surface p-4 shadow-card">
            <header className="mb-3 flex items-center justify-between border-b border-border/30 pb-3">
              <h2 className="text-lg font-semibold text-white">Edit Venue</h2>
              <button
                type="button"
                onClick={() => setEditingVenueId(null)}
                className="inline-flex h-8 w-8 items-center justify-center border border-border/60 text-brand-muted hover:border-border hover:text-white"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </header>

            {editingVenueQuery.isLoading || !editingVenueQuery.data ? (
              <p className="text-sm text-brand-muted">Loading venue details...</p>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  const formData = new FormData(event.currentTarget)
                  updateMutation.mutate(formData)
                }}
                className="grid gap-2"
              >
                <div className="grid gap-2 sm:grid-cols-3">
                  <input name="name" defaultValue={editingVenueQuery.data.name} className="input-compact w-full" placeholder="Venue name" required />
                  <input name="resortGroup" defaultValue={editingVenueQuery.data.resortGroup ?? ''} className="input-compact w-full" placeholder="Resort group" />
                  <input name="website" defaultValue={editingVenueQuery.data.website ?? ''} className="input-compact w-full" placeholder="Website" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <input name="addressLine1" defaultValue={editingVenueQuery.data.addressLine1 ?? ''} className="input-compact w-full" placeholder="Address line 1" />
                  <input name="addressLine2" defaultValue={editingVenueQuery.data.addressLine2 ?? ''} className="input-compact w-full" placeholder="Address line 2" />
                  <input name="city" defaultValue={editingVenueQuery.data.city ?? ''} className="input-compact w-full" placeholder="City" />
                  <input name="stateProvince" defaultValue={editingVenueQuery.data.stateProvince ?? ''} className="input-compact w-full" placeholder="State / Province" />
                  <input name="postalCode" defaultValue={editingVenueQuery.data.postalCode ?? ''} className="input-compact w-full" placeholder="Postal code" />
                  <input name="country" defaultValue={editingVenueQuery.data.country ?? ''} className="input-compact w-full" placeholder="Country" />
                  <input name="phone" defaultValue={editingVenueQuery.data.phone ?? ''} className="input-compact w-full" placeholder="Phone" />
                  <input name="email" type="email" defaultValue={editingVenueQuery.data.email ?? ''} className="input-compact w-full" placeholder="Email" />
                </div>
                <textarea name="notes" defaultValue={editingVenueQuery.data.notes ?? ''} rows={3} className="input-compact w-full" placeholder="Notes" />

                <div className="mt-1 flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setEditingVenueId(null)} className="btn-compact-secondary">Cancel</button>
                  <button type="submit" disabled={updateMutation.isPending} className="btn-compact-primary">
                    {updateMutation.isPending ? 'Saving...' : 'Save Venue'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {deleteVenueId && deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl border border-border/60 bg-surface p-4 shadow-card">
            {deleteStep === 1 ? (
              <>
                <h3 className="text-lg font-semibold text-white">Delete Venue</h3>
                <p className="mt-2 text-sm text-brand-muted">
                  You are about to delete <span className="text-white">{deleteTarget.name}</span>. This action cannot be undone.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteVenueId(null)
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
                  Deleting this venue may affect linked lead locations and venue staff records.
                </p>

                {deleteTargetClientCount > 0 ? (
                  <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                    Warning: {deleteTargetClientCount} lead location record(s) are linked to this venue.
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteStep(1)}
                    className="btn-compact-secondary"
                    disabled={deleteMutation.isPending}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(deleteVenueId)}
                    className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/20 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-rose-100 hover:bg-rose-500/30 disabled:opacity-60"
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete Venue'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function renderSortableHeader(
  label: string,
  key: VenueSortKey,
  activeKey: VenueSortKey,
  direction: SortDirection,
  onToggle: (key: VenueSortKey) => void,
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
