import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { type LeadRecord } from '@/types'
import {
  createLeadInternalNote,
  deleteLeadInternalNote,
  fetchLeadInternalNotes,
  updateLeadInternalNote,
} from '@/services/leadNotesService'

interface LeadInternalNotesTabProps {
  lead: LeadRecord
  focusNoteId?: string | null
  title?: string
}

const INPUT_CLASS =
  'input-compact w-full'

export function LeadInternalNotesTab({ lead, focusNoteId, title = 'Notes' }: LeadInternalNotesTabProps) {
  const queryClient = useQueryClient()
  const [newNoteBody, setNewNoteBody] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')

  const notesQuery = useQuery({
    queryKey: ['lead-internal-notes', lead.id],
    queryFn: () => fetchLeadInternalNotes(lead.id),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createLeadInternalNote({
        leadId: lead.id,
        body: newNoteBody,
        brandId: lead.client.brandId,
        brandSlug: lead.client.brandSlug,
      }),
    onSuccess: () => {
      setNewNoteBody('')
      queryClient.invalidateQueries({ queryKey: ['lead-internal-notes', lead.id] })
      toast.success('Note added')
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to add note')
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingNoteId) {
        throw new Error('Missing note id')
      }
      return updateLeadInternalNote({ noteId: editingNoteId, body: editingBody })
    },
    onSuccess: () => {
      setEditingNoteId(null)
      setEditingBody('')
      queryClient.invalidateQueries({ queryKey: ['lead-internal-notes', lead.id] })
      toast.success('Note updated')
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to update note')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => deleteLeadInternalNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-internal-notes', lead.id] })
      toast.success('Note removed')
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to remove note')
    },
  })

  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusNoteId || !notesQuery.data?.some((note) => note.id === focusNoteId)) return
    const highlightId = window.setTimeout(() => {
      setHighlightedNoteId(focusNoteId)
    }, 0)
    const target = document.getElementById(`lead-note-${focusNoteId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const timeout = window.setTimeout(() => {
      setHighlightedNoteId((current) => (current === focusNoteId ? null : current))
    }, 2400)

    return () => {
      window.clearTimeout(highlightId)
      window.clearTimeout(timeout)
    }
  }, [focusNoteId, notesQuery.data])

  return (
    <Card title={title} className="p-4">
      <div className="space-y-3">
        <div className="space-y-2">
          <textarea
            rows={4}
            value={newNoteBody}
            onChange={(event) => setNewNoteBody(event.target.value)}
            className={INPUT_CLASS}
            placeholder="Add private note for your team"
          />
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !newNoteBody.trim()}
            className="btn-compact-primary"
          >
            Add Note
          </button>
        </div>

        {notesQuery.isLoading ? <p className="text-sm text-brand-muted">Loading notes…</p> : null}

        <div className="space-y-3">
          {(notesQuery.data ?? []).map((note) => {
            const isEditing = editingNoteId === note.id
            return (
              <article
                key={note.id}
                id={`lead-note-${note.id}`}
                className={[
                  'rounded-2xl border bg-surface-muted/40 p-3 transition',
                  highlightedNoteId === note.id ? 'border-brand-primary/70 ring-1 ring-brand-primary/60' : 'border-border/40',
                ].join(' ')}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      rows={4}
                      value={editingBody}
                      onChange={(event) => setEditingBody(event.target.value)}
                      className={INPUT_CLASS}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateMutation.mutate()}
                        disabled={updateMutation.isPending || !editingBody.trim()}
                        className="btn-compact-primary"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(null)
                          setEditingBody('')
                        }}
                        className="btn-compact-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm text-white">{note.body}</p>
                    <p className="mt-2 text-xs text-brand-muted">{formatDateTime(note.updatedAt)}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(note.id)
                          setEditingBody(note.body)
                        }}
                        className="btn-compact-secondary"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(note.id)}
                        className="btn-compact-secondary"
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </article>
            )
          })}

          {!notesQuery.isLoading && !(notesQuery.data?.length ?? 0) ? (
            <p className="text-sm text-brand-muted">No notes yet.</p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Updated recently'
  }
  return `Updated ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}
