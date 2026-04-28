import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import SignatureCanvas from 'react-signature-canvas'
import toast from 'react-hot-toast'
import { Download, Eye } from 'lucide-react'

import { Card } from '@/components/ui/Card'
import { useBranding } from '@/contexts/BrandingContext'
import {
	fetchLatestContract,
	saveContractDraft,
	saveContractSignature,
} from '@/services/contractService'
import { fetchContractPdfSnapshot } from '@/services/documentPdfService'
import { resolvePdfLogoUrl } from '@/modules/documents/pdf/pdfBranding'
import { extractTemplateTokenKeys } from '@/services/templateTokenRenderingService'

export function ContractEditorPage() {
	const { brand } = useBranding()
	const [searchParams] = useSearchParams()
	const eventId = searchParams.get('eventId') ?? undefined
	const contractId = searchParams.get('contractId') ?? undefined
	const signatureRef = useRef<SignatureCanvas | null>(null)
	const [isPdfBusy, setIsPdfBusy] = useState(false)
	const [unresolvedTokens, setUnresolvedTokens] = useState<string[]>([])

	const editor = useEditor({
		extensions: [StarterKit],
		content: '<h2>Production Agreement</h2><p>Loading contract...</p>',
	})

	const {
		data: contract,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ['contract', brand.slug, eventId, contractId],
		queryFn: () => fetchLatestContract(brand.slug, { eventId, contractId }),
		staleTime: 1000 * 30,
	})

	useEffect(() => {
		if (contract?.bodyHtml && editor) {
			editor.commands.setContent(contract.bodyHtml)
			setUnresolvedTokens(extractTemplateTokenKeys(contract.bodyHtml))
		}
	}, [contract, editor])

	useEffect(() => {
		if (!editor) return

		const syncUnresolvedTokens = () => {
			setUnresolvedTokens(extractTemplateTokenKeys(editor.getHTML()))
		}

		syncUnresolvedTokens()
		editor.on('update', syncUnresolvedTokens)

		return () => {
			editor.off('update', syncUnresolvedTokens)
		}
	}, [editor])

	const saveDraftMutation = useMutation({
		mutationFn: ({ id, bodyHtml }: { id: string; bodyHtml: string }) => saveContractDraft(id, bodyHtml),
		onSuccess: () => {
			toast.success('Contract draft synced to Supabase.')
			refetch()
		},
		onError: (error) => {
			console.error(error)
			toast.error('Unable to save contract draft.')
		},
	})

	const signatureMutation = useMutation({
		mutationFn: ({ id, dataUrl }: { id: string; dataUrl: string }) => saveContractSignature(id, dataUrl),
		onSuccess: () => {
			toast.success('Signature stored in Supabase Storage.')
			signatureRef.current?.clear()
			refetch()
		},
		onError: (error) => {
			console.error(error)
			toast.error('Unable to save signature.')
		},
	})

	const handleSave = async () => {
		if (!editor) return
		if (!contract?.id) {
			toast.error('No contract available. Create one from Supabase.')
			return
		}
		await saveDraftMutation.mutateAsync({ id: contract.id, bodyHtml: editor.getHTML() })
	}

	const handleSignatureSave = async () => {
		if (!contract?.id) {
			toast.error('No contract available to store the signature.')
			return
		}
		const drawing = signatureRef.current?.getTrimmedCanvas()
		const dataUrl = drawing?.toDataURL('image/png')
		if (!dataUrl) {
			toast.error('Capture a signature before saving.')
			return
		}
		await signatureMutation.mutateAsync({ id: contract.id, dataUrl })
	}

	const handleClearSignature = () => signatureRef.current?.clear()

	const handleContractPdf = async (mode: 'view' | 'download') => {
		if (!contract?.id) {
			toast.error('No contract available to render')
			return
		}

		try {
			setIsPdfBusy(true)
			const snapshot = await fetchContractPdfSnapshot(contract.id)
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
				bodyHtml: editor?.getHTML() ?? snapshot.bodyHtml,
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
			setIsPdfBusy(false)
		}
	}

	return (
		<div className="space-y-6">
			<Card
				title="Contract editor"
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() => void handleContractPdf('view')}
							disabled={!contract?.id || isPdfBusy}
							className="rounded-2xl border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-60"
						>
							<Eye size={14} className="mr-1 inline-block" />
							View PDF
						</button>
						<button
							type="button"
							onClick={() => void handleContractPdf('download')}
							disabled={!contract?.id || isPdfBusy}
							className="rounded-2xl border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-60"
						>
							<Download size={14} className="mr-1 inline-block" />
							Download
						</button>
						<button
							type="button"
							onClick={handleSave}
							disabled={!contract?.id || saveDraftMutation.isPending || !editor}
							className="rounded-2xl border border-brand-primary/40 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-60"
						>
							{saveDraftMutation.isPending ? 'Saving…' : 'Save draft'}
						</button>
					</div>
				}
			>
				{isLoading && !contract && <p className="text-sm text-brand-muted">Loading contract from Supabase…</p>}
				{!isLoading && !contract && (
					<p className="text-sm text-brand-muted">
						No contracts found for {brand.label}. Create a contract row in Supabase linked to an event to begin editing.
					</p>
				)}
				<div className="grid gap-6 lg:grid-cols-2">
					<div className="rounded-3xl border border-border/30 bg-surface-muted/40 p-4">
						{editor ? (
							<EditorContent editor={editor} className="prose prose-invert max-w-none" />
						) : (
							<p className="text-sm text-brand-muted">Preparing editor…</p>
						)}
					</div>
					<div className="space-y-4 text-sm">
						{unresolvedTokens.length ? (
							<div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs">
								<p className="uppercase tracking-[0.2em] text-amber-200">Unresolved Tokens</p>
								<p className="mt-1 text-brand-muted">
									{unresolvedTokens.length} token{unresolvedTokens.length > 1 ? 's are' : ' is'} still unresolved in this contract.
								</p>
								<div className="mt-2 flex flex-wrap gap-2">
									{unresolvedTokens.map((token) => (
										<span key={token} className="inline-flex items-center border border-amber-300/50 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-100">
											{`{{${token}}}`}
										</span>
									))}
								</div>
							</div>
						) : null}
						{contract?.appliedTemplate ? (
							<div className="rounded-2xl border border-brand-primary/35 bg-brand-primary/10 p-3 text-xs">
								<p className="uppercase tracking-[0.2em] text-brand-muted">Applied Template</p>
								<p className="mt-1 text-white">{contract.appliedTemplate.templateName ?? 'Template from quote settings'}</p>
								{contract.appliedTemplate.templateTitle ? (
									<p className="text-brand-muted">Title: {contract.appliedTemplate.templateTitle}</p>
								) : null}
								{contract.appliedTemplate.templateId ? (
									<p className="text-brand-muted">ID: {contract.appliedTemplate.templateId}</p>
								) : null}
							</div>
						) : null}
						<p className="text-brand-muted">
							Variables such as {'{{client_name}}'} and {'{{brand}}'} are merged via Supabase Edge Functions before PDF
							generation. Signature data is persisted in Storage as PNG and linked to contracts table.
						</p>
						<div>
							<p className="mb-2 text-xs uppercase tracking-[0.3em] text-brand-muted">Signature preview</p>
							<div className="rounded-3xl border border-border/40 bg-white/5 p-4">
								<SignatureCanvas
									ref={signatureRef}
									penColor="#f95f62"
									canvasProps={{ width: 400, height: 160, className: 'signature-canvas' }}
								/>
								<div className="mt-3 flex gap-2">
									<button
										type="button"
										onClick={handleClearSignature}
										className="rounded-2xl border border-border/40 px-3 py-2 text-xs uppercase tracking-widest text-brand-muted"
									>
										Clear
									</button>
									<button
										type="button"
										onClick={handleSignatureSave}
										disabled={!contract?.id || signatureMutation.isPending}
										className="rounded-2xl bg-brand-primary/30 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-60"
									>
										{signatureMutation.isPending ? 'Uploading…' : 'Save image'}
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</Card>
		</div>
	)
}
