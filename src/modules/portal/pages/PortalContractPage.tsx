import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import SignatureCanvas from 'react-signature-canvas'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { useBranding } from '@/contexts/BrandingContext'
import { usePortalContext } from '@/hooks/usePortalContext'
import { fetchLatestContract, saveContractSignature } from '@/services/contractService'

export function PortalContractPage() {
  const { brand } = useBranding()
  const queryClient = useQueryClient()
  const { data: portal, isLoading: isPortalLoading } = usePortalContext()
  const eventId = portal?.event?.id
  const step = portal?.steps.find((item) => item.key === 'contract')
  const signatureRef = useRef<SignatureCanvas | null>(null)

  const { data: contract, isLoading } = useQuery({
    queryKey: ['portal-contract', brand.slug, eventId],
    queryFn: () => fetchLatestContract(brand.slug, { eventId }),
    enabled: Boolean(eventId),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!contract?.id) return
      const drawing = signatureRef.current?.getTrimmedCanvas()
      const dataUrl = drawing?.toDataURL('image/png')
      if (!dataUrl) {
        throw new Error('Signature missing')
      }
      await saveContractSignature(contract.id, dataUrl)
    },
    onSuccess: async () => {
      toast.success('Contract signed. Billing unlocks next!')
      signatureRef.current?.clear()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['portal-contract', brand.slug, eventId] }),
        queryClient.invalidateQueries({ queryKey: ['portal-context', brand.slug] }),
      ])
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to capture signature right now.')
    },
  })

  if (step?.status === 'locked') {
    return (
      <Card title="Contract">
        <p className="text-sm text-brand-muted">{step.lockedReason ?? 'Submit the questionnaire to unlock your contract.'}</p>
      </Card>
    )
  }

  if (!eventId && !isPortalLoading) {
    return (
      <Card title="Contract">
        <p className="text-sm text-brand-muted">We need event details on file before generating the agreement.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card
        title="Agreement"
        actions={
          contract ? (
            <StatusPill label={contract.signedAt ? 'Signed' : 'Pending'} tone={contract.signedAt ? 'success' : 'brand'} />
          ) : undefined
        }
      >
        {isLoading ? (
          <p className="text-sm text-brand-muted">Loading contract…</p>
        ) : !contract ? (
          <p className="text-sm text-brand-muted">
            An agreement has not been generated yet. Your producer will upload it after reviewing the questionnaire.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="max-h-[480px] overflow-y-auto rounded-3xl border border-border/30 bg-surface-muted/40 p-6 text-sm leading-relaxed text-white">
              <article dangerouslySetInnerHTML={{ __html: contract.bodyHtml }} />
            </div>
            {contract.pdfUrl && (
              <a
                href={contract.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-sm font-semibold text-brand-primary underline"
              >
                Download signed PDF
              </a>
            )}
          </div>
        )}
      </Card>

      <Card title="Signature" subdued>
        {contract?.signedAt ? (
          <p className="text-sm text-brand-muted">
            Signature captured on {new Date(contract.signedAt).toLocaleDateString('es-MX', { dateStyle: 'long' })}. Thank you!
          </p>
        ) : (
          <div className="space-y-4 text-sm text-brand-muted">
            <p>Draw your signature below to accept the terms. You can use a mouse, trackpad, or touch input.</p>
            <div className="rounded-3xl border border-border/40 bg-white/5 p-4">
              <SignatureCanvas
                ref={signatureRef}
                penColor="#f95f62"
                canvasProps={{ className: 'w-full rounded-2xl bg-white', height: 220 }}
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => signatureRef.current?.clear()}
                  className="rounded-2xl border border-border/40 px-4 py-2 text-xs uppercase tracking-[0.4em] text-brand-muted"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending || !contract}
                  className="rounded-2xl border border-brand-primary/40 bg-brand-primary/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.4em] text-white disabled:opacity-60"
                >
                  {mutation.isPending ? 'Saving…' : 'Save signature'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
