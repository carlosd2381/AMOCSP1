import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createLead,
  createLeadBoardSkeleton,
  deleteLead,
  fetchLeadBoard,
  updateLeadStatus,
} from '@/services/leadService'
import { useBranding } from '@/contexts/BrandingContext'
import { type LeadRecord, type LeadStatus } from '@/types'
import { LeadBoard } from '../components/LeadBoard'
import toast from 'react-hot-toast'
import { prefetchLeadProfileRoute, trackRouteNavigation } from '@/routes/routePrefetch'
import { X } from 'lucide-react'
import type { ClientLanguage, ClientMarketType } from '@/types'

const LEAD_SOURCE_OPTIONS = [
  'Facebook',
  'Instagram',
  'TikTok',
  'Facebook Group',
  'Facebook Ad',
  'Instagram Ad',
  'Search Engine',
  'Online Ad',
  'Family or friend Referral',
  'Vendor Referral',
  'Wedding Planner Referral',
  'Other Photographer/Cinematographer',
  'Other',
] as const

export function LeadsBoardPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { brand } = useBranding()
  const queryClient = useQueryClient()
  const boardQueryKey = ['lead-board', brand.slug] as const
  const [columns, setColumns] = useState<Record<LeadStatus, LeadRecord[]>>(() => createLeadBoardSkeleton())
  const [search, setSearch] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState({
    name: '',
    email: '',
    phone: '',
    eventDate: '',
    notes: '',
    source: '',
    type: brand.slug === 'amo' ? 'couple' as const : 'corporate' as const,
    clientType: 'INT' as ClientMarketType,
    preferredLanguage: 'en' as ClientLanguage,
  })

  const { data, isLoading } = useQuery({
    queryKey: boardQueryKey,
    queryFn: () => fetchLeadBoard(brand.slug),
  })

  const statusFilter = searchParams.get('status') as LeadStatus | null
  const hasStatusFilter = statusFilter === 'new'
    || statusFilter === 'contacted'
    || statusFilter === 'proposal'
    || statusFilter === 'contract'
    || statusFilter === 'booked'
    || statusFilter === 'lost'

  const displayColumns = useMemo(() => {
    const query = search.trim().toLowerCase()
    const searchableColumns = !query ? columns : {
      new: columns.new.filter((lead) => matchesLeadSearch(lead, query)),
      contacted: columns.contacted.filter((lead) => matchesLeadSearch(lead, query)),
      proposal: columns.proposal.filter((lead) => matchesLeadSearch(lead, query)),
      contract: columns.contract.filter((lead) => matchesLeadSearch(lead, query)),
      booked: columns.booked.filter((lead) => matchesLeadSearch(lead, query)),
      lost: columns.lost.filter((lead) => matchesLeadSearch(lead, query)),
    }

    if (!hasStatusFilter || !statusFilter) return searchableColumns
    return {
      new: statusFilter === 'new' ? searchableColumns.new : [],
      contacted: statusFilter === 'contacted' ? searchableColumns.contacted : [],
      proposal: statusFilter === 'proposal' ? searchableColumns.proposal : [],
      contract: statusFilter === 'contract' ? searchableColumns.contract : [],
      booked: statusFilter === 'booked' ? searchableColumns.booked : [],
      lost: statusFilter === 'lost' ? searchableColumns.lost : [],
    }
  }, [columns, hasStatusFilter, search, statusFilter])

  useEffect(() => {
    const resetId = window.setTimeout(() => {
      setColumns(createLeadBoardSkeleton())
    }, 0)

    return () => window.clearTimeout(resetId)
  }, [brand.slug])

  useEffect(() => {
    if (!data) return

    const syncId = window.setTimeout(() => {
      setColumns(data)
    }, 0)

    return () => window.clearTimeout(syncId)
  }, [data])

  const statusMutation = useMutation({
    mutationFn: updateLeadStatus,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteLead,
  })

  const createMutation = useMutation({
    mutationFn: createLead,
    onSuccess: (record) => {
      setColumns((previous) => ({
        ...previous,
        new: [record, ...previous.new],
      }))
      setCreateDraft({
        name: '',
        email: '',
        phone: '',
        eventDate: '',
        notes: '',
        source: '',
        type: brand.slug === 'amo' ? 'couple' : 'corporate',
        clientType: 'INT',
        preferredLanguage: 'en',
      })
      setIsCreateOpen(false)
      queryClient.invalidateQueries({ queryKey: boardQueryKey })
      toast.success('Lead added')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to create lead')
    },
  })

  const handleReorder = ({ leadId, toStatus }: { leadId: string; toStatus: LeadStatus }) => {
    const previous = columns
    const next = reorderBoard(previous, leadId, toStatus)
    setColumns(next)

    statusMutation.mutate(
      { leadId, toStatus },
      {
        onError: (error) => {
          console.error(error)
          setColumns(previous)
          toast.error('Unable to update lead status')
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: boardQueryKey })
        },
      },
    )
  }

  if (isLoading) {
    return <p className="text-sm text-brand-muted">Loading board…</p>
  }

  const handleLeadClick = (leadId: string) => {
    trackRouteNavigation('/leads/:leadId')
    navigate(`/leads/${leadId}`)
  }

  const handleLeadEdit = (leadId: string) => {
    trackRouteNavigation('/leads/:leadId')
    navigate(`/leads/${leadId}?tab=overview`)
  }

  const handleLeadDelete = async (leadId: string) => {
    const previous = columns
    setColumns(removeLeadFromBoard(previous, leadId))

    try {
      await deleteMutation.mutateAsync(leadId)
      toast.success('Lead deleted')
    } catch (error) {
      console.error(error)
      setColumns(previous)
      toast.error('Unable to delete lead')
      throw error
    } finally {
      queryClient.invalidateQueries({ queryKey: boardQueryKey })
    }
  }

  return (
    <div className="space-y-6">
      {hasStatusFilter && statusFilter ? (
        <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-surface-muted/30 px-3 py-2 text-sm text-brand-muted">
          <p>Filtered board: <span className="uppercase tracking-[0.12em] text-white">{statusFilter}</span></p>
          <button
            type="button"
            onClick={() => setSearchParams((previous) => {
              const next = new URLSearchParams(previous)
              next.delete('status')
              return next
            })}
            className="btn-compact-secondary"
          >
            Clear Filter
          </button>
        </div>
      ) : null}
      <LeadBoard
        columns={displayColumns}
        searchValue={search}
        onSearchChange={setSearch}
        onAddLead={() => setIsCreateOpen(true)}
        onReorder={handleReorder}
        onLeadClick={handleLeadClick}
        onLeadEdit={handleLeadEdit}
        onLeadDelete={handleLeadDelete}
        onLeadPrefetch={() => prefetchLeadProfileRoute()}
      />

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl border border-border/60 bg-surface p-4 shadow-card">
            <header className="mb-3 flex items-center justify-between border-b border-border/30 pb-3">
              <h2 className="text-lg font-semibold text-white">New Lead</h2>
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
                createMutation.mutate({
                  client: {
                    name: createDraft.name.trim(),
                    email: createDraft.email.trim(),
                    phone: createDraft.phone.trim() || undefined,
                    type: createDraft.type,
                    marketProfile: {
                      clientType: createDraft.clientType,
                      preferredLanguage: createDraft.preferredLanguage,
                      preferredCurrency: createDraft.clientType === 'MEX' ? 'MXN' : 'USD',
                      preferredCatalog: createDraft.clientType === 'MEX' ? 'MEX_MXN_ESP' : 'INT_USD_ENG',
                    },
                  },
                  eventDate: createDraft.eventDate || undefined,
                  notes: createDraft.notes.trim() || undefined,
                  source: createDraft.source.trim() || undefined,
                  brandSlug: brand.slug,
                })
              }}
              className="grid gap-2"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="input-compact w-full"
                  placeholder="Client name"
                  value={createDraft.name}
                  onChange={(event) => setCreateDraft((previous) => ({ ...previous, name: event.target.value }))}
                  required
                />
                <input
                  className="input-compact w-full"
                  placeholder="Client email"
                  type="email"
                  value={createDraft.email}
                  onChange={(event) => setCreateDraft((previous) => ({ ...previous, email: event.target.value }))}
                  required
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  className="input-compact w-full"
                  placeholder="Phone"
                  value={createDraft.phone}
                  onChange={(event) => setCreateDraft((previous) => ({ ...previous, phone: event.target.value }))}
                />
                <input
                  className="input-compact w-full"
                  type="date"
                  value={createDraft.eventDate}
                  onChange={(event) => setCreateDraft((previous) => ({ ...previous, eventDate: event.target.value }))}
                />
                <select
                  className="select-compact w-full"
                  value={createDraft.type}
                  onChange={(event) => setCreateDraft((previous) => ({ ...previous, type: event.target.value as 'couple' | 'corporate' }))}
                >
                  <option value="couple">Wedding</option>
                  <option value="corporate">Corporate</option>
                </select>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  className="select-compact w-full"
                  value={createDraft.clientType}
                  onChange={(event) => {
                    const nextType = event.target.value as ClientMarketType
                    setCreateDraft((previous) => ({
                      ...previous,
                      clientType: nextType,
                      preferredLanguage: nextType === 'MEX' ? 'es' : 'en',
                    }))
                  }}
                >
                  <option value="INT">Client Type: INT</option>
                  <option value="MEX">Client Type: MEX</option>
                </select>
                <select
                  className="select-compact w-full"
                  value={createDraft.preferredLanguage}
                  onChange={(event) => setCreateDraft((previous) => ({ ...previous, preferredLanguage: event.target.value as ClientLanguage }))}
                >
                  <option value="en">Language: English</option>
                  <option value="es">Language: Spanish</option>
                </select>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  className="select-compact w-full"
                  value={createDraft.source}
                  onChange={(event) => setCreateDraft((previous) => ({ ...previous, source: event.target.value }))}
                >
                  <option value="">Lead source</option>
                  {LEAD_SOURCE_OPTIONS.map((source) => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
                <input
                  className="input-compact w-full"
                  placeholder="Notes"
                  value={createDraft.notes}
                  onChange={(event) => setCreateDraft((previous) => ({ ...previous, notes: event.target.value }))}
                />
              </div>

              <div className="mt-1 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="btn-compact-secondary">Cancel</button>
                <button
                  type="submit"
                  className="btn-compact-primary"
                  disabled={createMutation.isPending || !createDraft.name.trim() || !createDraft.email.trim()}
                >
                  {createMutation.isPending ? 'Saving…' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function matchesLeadSearch(lead: LeadRecord, query: string) {
  const typeLabel = lead.client.type === 'couple' ? 'wedding' : 'corporate'
  const haystack = [
    lead.client.name,
    lead.client.email,
    lead.client.phone ?? '',
    lead.venueName ?? '',
    lead.eventDate ?? '',
    lead.source ?? '',
    typeLabel,
    lead.status,
  ].join(' ').toLowerCase()

  return haystack.includes(query)
}

function reorderBoard(
  source: Record<LeadStatus, LeadRecord[]>,
  leadId: string,
  toStatus: LeadStatus,
) {
  const base = Object.fromEntries(
    (Object.entries(source) as Array<[LeadStatus, LeadRecord[]]>).map(([status, items]) => [
      status,
      items.filter((lead) => lead.id !== leadId),
    ]),
  ) as Record<LeadStatus, LeadRecord[]>

  const movedLead = Object.values(source)
    .flat()
    .find((lead) => lead.id === leadId)

  if (movedLead) {
    base[toStatus] = [{ ...movedLead, status: toStatus }, ...base[toStatus]]
  }

  return base
}

function removeLeadFromBoard(source: Record<LeadStatus, LeadRecord[]>, leadId: string) {
  return Object.fromEntries(
    (Object.entries(source) as Array<[LeadStatus, LeadRecord[]]>).map(([status, items]) => [
      status,
      items.filter((lead) => lead.id !== leadId),
    ]),
  ) as Record<LeadStatus, LeadRecord[]>
}
