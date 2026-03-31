import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { type LeadRecord } from '@/types'
import {
  createLeadFile,
  deleteLeadFile,
  fetchLeadFiles,
  type LeadFileCategory,
} from '@/services/leadFilesService'

interface LeadFilesTabProps {
  lead: LeadRecord
  focusFileId?: string | null
}

const INPUT_CLASS =
  'input-compact w-full'

const FILE_SECTIONS: Array<{ category: LeadFileCategory; label: string }> = [
  { category: 'contracts', label: 'Contracts' },
  { category: 'timelines', label: 'Timelines' },
  { category: 'shot_lists', label: 'Shot Lists' },
]

export function LeadFilesTab({ lead, focusFileId }: LeadFilesTabProps) {
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<LeadFileCategory>('contracts')
  const [title, setTitle] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [notes, setNotes] = useState('')

  const filesQuery = useQuery({
    queryKey: ['lead-files', lead.id],
    queryFn: () => fetchLeadFiles(lead.id),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createLeadFile({
        leadId: lead.id,
        category,
        title,
        fileUrl,
        notes,
        brandId: lead.client.brandId,
        brandSlug: lead.client.brandSlug,
      }),
    onSuccess: () => {
      setTitle('')
      setFileUrl('')
      setNotes('')
      queryClient.invalidateQueries({ queryKey: ['lead-files', lead.id] })
      toast.success('File link saved')
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to save file link')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => deleteLeadFile(fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-files', lead.id] }),
    onError: (error) => {
      console.error(error)
      toast.error('Unable to remove file')
    },
  })

  const grouped = useMemo(() => {
    const files = filesQuery.data ?? []
    return {
      contracts: files.filter((item) => item.category === 'contracts'),
      timelines: files.filter((item) => item.category === 'timelines'),
      shot_lists: files.filter((item) => item.category === 'shot_lists'),
    }
  }, [filesQuery.data])

  const [highlightedFileId, setHighlightedFileId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusFileId || !filesQuery.data?.some((file) => file.id === focusFileId)) return
    const highlightId = window.setTimeout(() => {
      setHighlightedFileId(focusFileId)
    }, 0)
    const target = document.getElementById(`lead-file-${focusFileId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const timeout = window.setTimeout(() => {
      setHighlightedFileId((current) => (current === focusFileId ? null : current))
    }, 2400)

    return () => {
      window.clearTimeout(highlightId)
      window.clearTimeout(timeout)
    }
  }, [focusFileId, filesQuery.data])

  return (
    <Card title="Files" className="p-4">
      <div className="space-y-3">
        <div className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={category} onChange={(event) => setCategory(event.target.value as LeadFileCategory)} className={INPUT_CLASS}>
              {FILE_SECTIONS.map((section) => (
                <option key={section.category} value={section.category}>
                  {section.label}
                </option>
              ))}
            </select>
            <input
              className={INPUT_CLASS}
              placeholder="File title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <input
              className={INPUT_CLASS}
              placeholder="https://file-url"
              value={fileUrl}
              onChange={(event) => setFileUrl(event.target.value)}
            />
          </div>
          <textarea
            rows={2}
            className={INPUT_CLASS}
            placeholder="Notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !title.trim() || !fileUrl.trim()}
            className="btn-compact-primary w-fit"
          >
            Save File Link
          </button>
        </div>

        {filesQuery.isLoading ? <p className="text-sm text-brand-muted">Loading files…</p> : null}

        <div className="grid gap-3 lg:grid-cols-3">
          {FILE_SECTIONS.map((section) => (
            <section key={section.category} className="rounded-2xl border border-border/40 bg-surface-muted/40 p-3">
              <h3 className="text-sm font-semibold text-white">{section.label}</h3>
              <div className="mt-3 space-y-2">
                {grouped[section.category].map((item) => (
                  <article
                    key={item.id}
                    id={`lead-file-${item.id}`}
                    className={[
                      'rounded-xl border bg-surface/70 p-3 transition',
                      highlightedFileId === item.id ? 'border-brand-primary/70 ring-1 ring-brand-primary/60' : 'border-border/40',
                    ].join(' ')}
                  >
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-white underline-offset-2 hover:underline"
                    >
                      {item.title}
                    </a>
                    {item.notes ? <p className="mt-1 text-xs text-brand-muted">{item.notes}</p> : null}
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(item.id)}
                      className="btn-compact-secondary mt-2"
                    >
                      Remove
                    </button>
                  </article>
                ))}
                {!grouped[section.category].length ? <p className="text-xs text-brand-muted">No files yet.</p> : null}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Card>
  )
}
