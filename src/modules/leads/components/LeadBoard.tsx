import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, ChevronsUpDown, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { type LeadRecord, type LeadStatus } from '@/types'
import { Card } from '@/components/ui/Card'
import { fetchLeadDeletionImpact } from '@/services/leadService'
import clsx from 'clsx'

const STATUS_META: Record<LeadStatus, { label: string; accent: string }> = {
  new: { label: 'New', accent: 'from-rose-500/30 to-rose-500/10' },
  contacted: { label: 'Contacted', accent: 'from-amber-500/30 to-amber-500/10' },
  proposal: { label: 'Proposal', accent: 'from-sky-500/30 to-sky-500/10' },
  contract: { label: 'Contract', accent: 'from-emerald-500/30 to-emerald-500/10' },
  booked: { label: 'Booked', accent: 'from-brand-primary/30 to-brand-primary/10' },
  lost: { label: 'Lost', accent: 'from-zinc-500/30 to-zinc-500/10' },
}

const COLUMN_ORDER: LeadStatus[] = ['new', 'contacted', 'proposal', 'contract', 'booked', 'lost']

type SortDirection = 'asc' | 'desc'
type LeadSortKey = 'client' | 'venue' | 'type' | 'eventDate' | 'stage' | 'status'

interface LeadBoardProps {
  columns: Record<LeadStatus, LeadRecord[]>
  searchValue: string
  onSearchChange: (value: string) => void
  onAddLead: () => void
  onReorder: (payload: { leadId: string; toStatus: LeadStatus }) => void
  onLeadClick: (leadId: string) => void
  onLeadEdit: (leadId: string) => void
  onLeadDelete: (leadId: string) => Promise<void>
  onLeadPrefetch?: (leadId: string) => void
}

export function LeadBoard({
  columns,
  searchValue,
  onSearchChange,
  onAddLead,
  onReorder,
  onLeadClick,
  onLeadEdit,
  onLeadDelete,
  onLeadPrefetch,
}: LeadBoardProps) {
  const rows = useMemo(
    () => COLUMN_ORDER.flatMap((status) => columns[status] ?? []),
    [columns],
  )
  const [sortKey, setSortKey] = useState<LeadSortKey>('client')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)
  const [isDeleting, setIsDeleting] = useState(false)

  const sortedRows = useMemo(() => {
    const next = [...rows]

    next.sort((a, b) => {
      const directionFactor = sortDirection === 'asc' ? 1 : -1

      if (sortKey === 'client') {
        return a.client.name.localeCompare(b.client.name) * directionFactor
      }

      if (sortKey === 'venue') {
        return (a.venueName ?? '').localeCompare(b.venueName ?? '') * directionFactor
      }

      if (sortKey === 'type') {
        const aType = a.client.type === 'couple' ? 'Wedding' : 'Corporate'
        const bType = b.client.type === 'couple' ? 'Wedding' : 'Corporate'
        return aType.localeCompare(bType) * directionFactor
      }

      if (sortKey === 'eventDate') {
        const aDate = new Date(a.eventDate || '').getTime() || 0
        const bDate = new Date(b.eventDate || '').getTime() || 0
        return (aDate - bDate) * directionFactor
      }

      const aLabel = STATUS_META[a.status].label
      const bLabel = STATUS_META[b.status].label
      return aLabel.localeCompare(bLabel) * directionFactor
    })

    return next
  }, [rows, sortDirection, sortKey])

  const deleteTarget = useMemo(() => rows.find((lead) => lead.id === deleteLeadId) ?? null, [rows, deleteLeadId])

  const deleteImpactQuery = useQuery({
    queryKey: ['lead-delete-impact', deleteLeadId],
    queryFn: async () => {
      if (!deleteLeadId) return null
      return fetchLeadDeletionImpact(deleteLeadId)
    },
    enabled: Boolean(deleteLeadId),
  })

  const documentRecordsCount =
    (deleteImpactQuery.data?.contracts ?? 0)
    + (deleteImpactQuery.data?.invoices ?? 0)
    + (deleteImpactQuery.data?.questionnaires ?? 0)
    + (deleteImpactQuery.data?.galleries ?? 0)
    + (deleteImpactQuery.data?.files ?? 0)
    + (deleteImpactQuery.data?.proposals ?? 0)

  const closeDeleteDialog = () => {
    if (isDeleting) return
    setDeleteLeadId(null)
    setDeleteStep(1)
  }

  const toggleSort = (key: LeadSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <Card
      title="Leads"
      className="p-4"
      actions={<span className="text-xs text-brand-muted"># {rows.length} Total</span>}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          className="input-compact w-full"
          placeholder="Search leads"
        />
        <button
          type="button"
          onClick={onAddLead}
          className="btn-compact-primary inline-flex items-center gap-1 whitespace-nowrap px-4"
        >
          <Plus size={13} /> Add Lead
        </button>
      </div>

      <div className="overflow-x-auto border border-border/40">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/40 text-[11px] uppercase tracking-[0.14em] text-brand-muted">
              <th className="py-2 pl-3 pr-3">{renderSortableHeader('Client', 'client', sortKey, sortDirection, toggleSort)}</th>
              <th className="py-2 pr-3">{renderSortableHeader('Venue', 'venue', sortKey, sortDirection, toggleSort)}</th>
              <th className="py-2 pr-3">{renderSortableHeader('Type', 'type', sortKey, sortDirection, toggleSort)}</th>
              <th className="py-2 pr-3">{renderSortableHeader('Event Date', 'eventDate', sortKey, sortDirection, toggleSort)}</th>
              <th className="py-2 pr-3">{renderSortableHeader('Stage', 'stage', sortKey, sortDirection, toggleSort)}</th>
              <th className="py-2 pr-3">{renderSortableHeader('Status', 'status', sortKey, sortDirection, toggleSort)}</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((lead) => (
              <tr
                key={lead.id}
                onMouseEnter={() => onLeadPrefetch?.(lead.id)}
                className={clsx('border-b border-border/20 align-top transition hover:bg-surface-muted/25')}
              >
                <td className="py-2.5 pl-3 pr-3">
                  <button
                    type="button"
                    onClick={() => onLeadClick(lead.id)}
                    className="text-left text-sm font-semibold text-white transition hover:text-brand-accent"
                  >
                    {lead.client.name}
                  </button>
                  <p className="mt-1 text-xs text-brand-muted">{lead.client.email}</p>
                </td>
                <td className="py-2.5 pr-3 text-xs text-brand-muted">
                  {lead.venueName || '-'}
                </td>
                <td className="py-2.5 pr-3 text-xs text-brand-muted">
                  {lead.client.type === 'couple' ? 'Wedding' : 'Corporate'}
                </td>
                <td className="py-2.5 pr-3 text-xs text-brand-muted">{lead.eventDate || 'TBD'}</td>
                <td className="py-2.5 pr-3">
                  <span
                    className={clsx(
                      'inline-flex rounded-xl bg-gradient-to-br px-2 py-1 text-[11px] font-medium text-white',
                      STATUS_META[lead.status].accent,
                    )}
                  >
                    {STATUS_META[lead.status].label}
                  </span>
                </td>
                <td className="py-2.5 pr-3">
                  <select
                    value={lead.status}
                    onChange={(event) => onReorder({ leadId: lead.id, toStatus: event.target.value as LeadStatus })}
                    className="select-compact"
                    aria-label={`Update status for ${lead.client.name}`}
                  >
                    {COLUMN_ORDER.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_META[status].label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onLeadClick(lead.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                      aria-label={`View ${lead.client.name}`}
                      title="View"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onLeadEdit(lead.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                      aria-label={`Edit ${lead.client.name}`}
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteLeadId(lead.id)
                        setDeleteStep(1)
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/40 text-rose-300 transition hover:border-rose-400 hover:text-rose-200"
                      aria-label={`Delete ${lead.client.name}`}
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

        {!sortedRows.length ? <p className="px-3 py-4 text-sm text-brand-muted">No leads yet. Use Quick + to add your first lead.</p> : null}
      </div>

      {deleteLeadId && deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl border border-border/60 bg-surface p-4 shadow-card">
            {deleteStep === 1 ? (
              <>
                <h3 className="text-lg font-semibold text-white">Delete Lead</h3>
                <p className="mt-2 text-sm text-brand-muted">
                  You are about to delete <span className="text-white">{deleteTarget.client.name}</span>. This action cannot be undone.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button type="button" onClick={closeDeleteDialog} className="btn-compact-secondary">Cancel</button>
                  <button type="button" onClick={() => setDeleteStep(2)} className="btn-compact-primary">Continue</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-white">Final Confirmation</h3>
                {deleteImpactQuery.isLoading ? (
                  <p className="mt-2 text-sm text-brand-muted">Checking related records...</p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-brand-muted">
                      Deleting this lead will also remove related records because of cascade rules.
                    </p>

                    {documentRecordsCount > 0 ? (
                      <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                        Warning: {documentRecordsCount} document records are attached (contracts, invoices, proposals, questionnaires, galleries, or files) and will be deleted.
                      </div>
                    ) : null}

                    <ul className="mt-3 space-y-1 text-xs text-brand-muted">
                      <li>Events: {deleteImpactQuery.data?.events ?? 0}</li>
                      <li>Proposals: {deleteImpactQuery.data?.proposals ?? 0}</li>
                      <li>Contracts: {deleteImpactQuery.data?.contracts ?? 0}</li>
                      <li>Invoices: {deleteImpactQuery.data?.invoices ?? 0}</li>
                      <li>Questionnaires: {deleteImpactQuery.data?.questionnaires ?? 0}</li>
                      <li>Galleries: {deleteImpactQuery.data?.galleries ?? 0}</li>
                      <li>Files: {deleteImpactQuery.data?.files ?? 0}</li>
                      <li>Messages: {deleteImpactQuery.data?.messages ?? 0}</li>
                      <li>Tasks: {deleteImpactQuery.data?.tasks ?? 0}</li>
                      <li>Internal notes: {deleteImpactQuery.data?.internalNotes ?? 0}</li>
                      <li>Payables: {deleteImpactQuery.data?.payables ?? 0}</li>
                      <li>Contacts: {deleteImpactQuery.data?.contacts ?? 0}</li>
                      <li>Venue assignments: {deleteImpactQuery.data?.venueAssignments ?? 0}</li>
                    </ul>
                  </>
                )}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button type="button" onClick={closeDeleteDialog} className="btn-compact-secondary" disabled={isDeleting}>Back</button>
                  <button
                    type="button"
                    disabled={isDeleting || deleteImpactQuery.isLoading}
                    onClick={async () => {
                      if (!deleteLeadId) return
                      setIsDeleting(true)
                      try {
                        await onLeadDelete(deleteLeadId)
                        closeDeleteDialog()
                      } finally {
                        setIsDeleting(false)
                      }
                    }}
                    className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/20 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-rose-100 hover:bg-rose-500/30 disabled:opacity-60"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete Lead'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

function renderSortableHeader(
  label: string,
  key: LeadSortKey,
  activeKey: LeadSortKey,
  direction: SortDirection,
  onToggle: (key: LeadSortKey) => void,
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
