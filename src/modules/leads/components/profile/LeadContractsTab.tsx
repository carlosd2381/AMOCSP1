import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { type LeadRecord } from '@/types'
import { createContractForEvent, fetchLeadContracts } from '@/services/leadDocumentsService'
import { fetchContractPdfSnapshot } from '@/services/documentPdfService'
import { useBranding } from '@/contexts/BrandingContext'
import { resolvePdfLogoUrl } from '@/modules/documents/pdf/pdfBranding'

interface LeadContractsTabProps {
  lead: LeadRecord
  focusContractId?: string | null
}

export function LeadContractsTab({ lead, focusContractId }: LeadContractsTabProps) {
  const { brand } = useBranding()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedEventId, setSelectedEventId] = useState('')
  const [busyContractId, setBusyContractId] = useState<string | null>(null)

  const contractsQuery = useQuery({
    queryKey: ['lead-contracts', lead.id],
    queryFn: () => fetchLeadContracts(lead.id),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createContractForEvent({
        eventId: selectedEventId,
        brandId: lead.client.brandId,
        brandSlug: lead.client.brandSlug,
      }),
    onSuccess: () => {
      toast.success('Contract ready')
      queryClient.invalidateQueries({ queryKey: ['lead-contracts', lead.id] })
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to create contract')
    },
  })

  const events = contractsQuery.data?.events ?? []
  const contracts = useMemo(() => contractsQuery.data?.contracts ?? [], [contractsQuery.data?.contracts])

  const [highlightedContractId, setHighlightedContractId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusContractId || !contracts.some((contract) => contract.id === focusContractId)) return
    const highlightId = window.setTimeout(() => {
      setHighlightedContractId(focusContractId)
    }, 0)
    const target = document.getElementById(`lead-contract-${focusContractId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const timeout = window.setTimeout(() => {
      setHighlightedContractId((current) => (current === focusContractId ? null : current))
    }, 2400)

    return () => {
      window.clearTimeout(highlightId)
      window.clearTimeout(timeout)
    }
  }, [contracts, focusContractId])

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
        downloadPdfBlob(blob, `contract-${contractId.slice(0, 8)}.pdf`)
      }
    } catch (error) {
      console.error(error)
      toast.error('Unable to generate contract PDF')
    } finally {
      setBusyContractId(null)
    }
  }

  return (
    <Card title="Contracts" className="p-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedEventId}
            onChange={(event) => setSelectedEventId(event.target.value)}
            className="select-compact"
          >
            <option value="">Select event</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            className="btn-compact-primary"
          >
            Prepare Contract
          </button>
        </div>

        {contractsQuery.isLoading ? <p className="text-sm text-brand-muted">Loading contracts…</p> : null}

        <div className="space-y-3">
          {contracts.map((contract) => (
            <article
              key={contract.id}
              id={`lead-contract-${contract.id}`}
              className={[
                'rounded-2xl border bg-surface-muted/40 p-3 transition',
                highlightedContractId === contract.id ? 'border-brand-primary/70 ring-1 ring-brand-primary/60' : 'border-border/40',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white">{contract.eventTitle}</p>
                  <p className="mt-1 text-xs text-brand-muted">Updated {formatDate(contract.updatedAt)}</p>
                  {contract.contractTemplateName ? (
                    <p className="text-[11px] uppercase tracking-[0.08em] text-brand-muted/80">Template: {contract.contractTemplateName}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill label={contract.signedAt ? 'signed' : 'draft'} />
                  <button
                    type="button"
                    onClick={() => navigate(`/contracts/new?eventId=${contract.eventId}`)}
                    className="btn-compact-secondary"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleContractPdf(contract.id, 'view')}
                    className="btn-compact-secondary"
                    disabled={busyContractId === contract.id}
                  >
                    View PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleContractPdf(contract.id, 'download')}
                    className="btn-compact-secondary"
                    disabled={busyContractId === contract.id}
                  >
                    Download
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {!contractsQuery.isLoading && !contracts.length ? (
          <p className="text-sm text-brand-muted">No contracts linked to this lead yet.</p>
        ) : null}
      </div>
    </Card>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  return date.toLocaleDateString()
}
