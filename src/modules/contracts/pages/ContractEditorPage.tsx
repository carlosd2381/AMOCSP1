import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import SignatureCanvas from 'react-signature-canvas'
import toast from 'react-hot-toast'

import { Card } from '@/components/ui/Card'
import { useBranding } from '@/contexts/BrandingContext'
import {
	fetchLatestContract,
	saveContractDraft,
	saveContractSignature,
} from '@/services/contractService'

export function ContractEditorPage() {
	const { brand } = useBranding()
	const [searchParams] = useSearchParams()
	const eventId = searchParams.get('eventId') ?? undefined
	const signatureRef = useRef<SignatureCanvas | null>(null)

	const editor = useEditor({
		extensions: [StarterKit],
		content: '<h2>Production Agreement</h2><p>Loading contract...</p>',
	})

	const {
		data: contract,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ['contract', brand.slug, eventId],
		queryFn: () => fetchLatestContract(brand.slug, { eventId }),
		staleTime: 1000 * 30,
	})

	useEffect(() => {
		if (contract?.bodyHtml && editor) {
			editor.commands.setContent(contract.bodyHtml)
		}
	}, [contract, editor])

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

	return (
		<div className="space-y-6">
			<Card
				title="Contract editor"
				actions={
					<button
						type="button"
						onClick={handleSave}
						disabled={!contract?.id || saveDraftMutation.isPending || !editor}
						className="rounded-2xl border border-brand-primary/40 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-60"
					>
						{saveDraftMutation.isPending ? 'Saving…' : 'Save draft'}
					</button>
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
