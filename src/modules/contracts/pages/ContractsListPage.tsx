import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { useBranding } from '@/contexts/BrandingContext'
import { resolvePdfLogoUrl } from '@/modules/documents/pdf/pdfBranding'
import { fetchContractPdfSnapshot } from '@/services/documentPdfService'
import { deleteContract, fetchContractList } from '@/services/documentListService'
import { trackRouteNavigation } from '@/routes/routePrefetch'

export function ContractsListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { brand } = useBranding()
  const [search, setSearch] = useState('')
  const [busyContractId, setBusyContractId] = useState<string | null>(null)
  const [deleteContractId, setDeleteContractId] = useState<string | null>(null)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)

  const contractsQuery = useQuery({
    queryKey: ['contracts-list', brand.slug],
    queryFn: () => fetchContractList(brand.slug),
  })

  const filtered = useMemo(() => {
    const rows = contractsQuery.data ?? []
    const query = search.trim().toLowerCase()
    if (!query) return rows

    return rows.filter((row) => {
      const haystack = [
        row.contractId,
        row.clientName,
        row.eventDate ?? '',
        row.dueDate ?? '',
        row.status,
        row.contractTemplateName ?? '',
      ].join(' ').toLowerCase()

      return haystack.includes(query)
    })
  }, [contractsQuery.data, search])

  const deleteMutation = useMutation({
    mutationFn: deleteContract,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contracts-list', brand.slug] })
      toast.success('Contract archived')
      setDeleteContractId(null)
      setDeleteStep(1)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to archive contract')
    },
  })

  const deleteTarget = useMemo(
    () => (contractsQuery.data ?? []).find((row) => row.contractId === deleteContractId) ?? null,
    [contractsQuery.data, deleteContractId],
  )

  const handleContractPdf = async (contractId: string, mode: 'view' | 'download') => {
    try {
      setBusyContractId(contractId)
      const snapshot = await fetchContractPdfSnapshot(contractId)
      const { createContractPdfBlob, downloadPdfBlob, openPdfBlob } = await import('@/modules/documents/pdf/pdfDocuments')
      const blob = await createContractPdfBlob({
        contractId: snapshot.id,
        status: snapshot.status,
        updatedAt: snapshot.updatedAt,
        signedAt: snapshot.signedAt,
        clientName: snapshot.clientName,
        clientEmail: snapshot.clientEmail,
        eventTitle: snapshot.eventTitle ?? undefined,
        eventDate: snapshot.eventDate,
        bodyHtml: snapshot.bodyHtml,
        branding: {
          label: brand.label,
          logoUrl: resolvePdfLogoUrl(brand.slug, brand.logo.light),
          companyDetails: snapshot.companyDetails,
        },
      })

      if (mode === 'view') {
        openPdfBlob(blob)
      } else {
        downloadPdfBlob(blob, `contract-${snapshot.id.slice(0, 8)}.pdf`)
      }
    } catch (error) {
      console.error(error)
      toast.error('Unable to generate contract PDF')
    } finally {
      setBusyContractId(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title="Contracts"
        className="p-4"
        actions={<span className="text-xs text-brand-muted"># {filtered.length} Total</span>}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input-compact w-full"
              placeholder="Search contracts"
            />
            <button
              type="button"
              className="btn-compact-primary inline-flex items-center gap-1 whitespace-nowrap px-4"
              onClick={() => {
                trackRouteNavigation('/contracts/new')
                navigate('/contracts/new')
              }}
            >
              <Plus size={13} /> Add Contract
            </button>
          </div>

          {contractsQuery.isLoading ? <p className="text-sm text-brand-muted">Loading contracts...</p> : null}

          <div className="overflow-x-auto border border-border/40">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/40 bg-surface-muted/30 text-xs uppercase tracking-[0.14em] text-brand-muted">
                  <th className="px-2 py-2">Con. ID #</th>
                  <th className="px-2 py-2">Event Date</th>
                  <th className="px-2 py-2">Client Name</th>
                  <th className="px-2 py-2">Due Date</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!filtered.length ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-5 text-sm text-brand-muted">No contracts found.</td>
                  </tr>
                ) : null}
                {filtered.map((contract) => (
                  <tr key={contract.contractId} className="border-b border-border/20 text-sm text-white last:border-b-0 hover:bg-surface-muted/20">
                    <td className="px-2 py-2 font-medium">{contract.contractId.slice(0, 8).toUpperCase()}</td>
                    <td className="px-2 py-2 text-brand-muted">{formatDate(contract.eventDate)}</td>
                    <td className="px-2 py-2">
                      <div>{contract.clientName}</div>
                      {contract.contractTemplateName ? (
                        <div className="text-[11px] uppercase tracking-[0.08em] text-brand-muted/80">Template: {contract.contractTemplateName}</div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-brand-muted">{formatDate(contract.dueDate)}</td>
                    <td className="px-2 py-2"><StatusPill label={contract.status} tone={contract.status === 'signed' ? 'success' : 'warning'} /></td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void handleContractPdf(contract.contractId, 'view')}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          title="View"
                          aria-label={`View contract ${contract.contractId.slice(0, 8)}`}
                          disabled={Boolean(busyContractId)}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            trackRouteNavigation('/contracts/new')
                            navigate(`/contracts/new?contractId=${encodeURIComponent(contract.contractId)}&eventId=${encodeURIComponent(contract.eventId)}`)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          title="Edit"
                          aria-label={`Edit contract ${contract.contractId.slice(0, 8)}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleContractPdf(contract.contractId, 'download')}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-brand-muted transition hover:border-border hover:text-white"
                          title="Download"
                          aria-label={`Download contract ${contract.contractId.slice(0, 8)}`}
                          disabled={Boolean(busyContractId)}
                        >
                          <Download size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteContractId(contract.contractId)
                            setDeleteStep(1)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/40 text-rose-300 transition hover:border-rose-400 hover:text-rose-200"
                          title="Archive"
                          aria-label={`Archive contract ${contract.contractId.slice(0, 8)}`}
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

      {deleteContractId && deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl border border-border/60 bg-surface p-4 shadow-card">
            {deleteStep === 1 ? (
              <>
                <h3 className="text-lg font-semibold text-white">Archive Contract</h3>
                <p className="mt-2 text-sm text-brand-muted">
                  You are about to archive contract <span className="text-white">{deleteTarget.contractId.slice(0, 8).toUpperCase()}</span>.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteContractId(null)
                      setDeleteStep(1)
                    }}
                    className="btn-compact-secondary"
                  >
                    Cancel
                  </button>
                  <button type="button" onClick={() => setDeleteStep(2)} className="btn-compact-primary">Continue</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-white">Final Confirmation</h3>
                <p className="mt-2 text-sm text-brand-muted">
                  Archiving keeps this contract for legal/audit history while removing it from active lists.
                </p>
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
                    onClick={() => deleteMutation.mutate(deleteContractId)}
                    className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/20 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-rose-100 hover:bg-rose-500/30 disabled:opacity-60"
                  >
                    {deleteMutation.isPending ? 'Archiving...' : 'Archive Contract'}
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

function formatDate(value: string | null | undefined) {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}
