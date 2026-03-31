import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { type LeadRecord } from '@/types'
import { createQuestionnaireDraftForEvent, fetchLeadQuestionnaires } from '@/services/leadDocumentsService'

interface LeadQuestionnairesTabProps {
  lead: LeadRecord
  focusQuestionnaireId?: string | null
}

export function LeadQuestionnairesTab({ lead, focusQuestionnaireId }: LeadQuestionnairesTabProps) {
  const queryClient = useQueryClient()
  const [selectedEventId, setSelectedEventId] = useState('')

  const questionnairesQuery = useQuery({
    queryKey: ['lead-questionnaires', lead.id],
    queryFn: () => fetchLeadQuestionnaires(lead.id),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createQuestionnaireDraftForEvent({
        eventId: selectedEventId,
        clientEmail: lead.client.email,
        brandId: lead.client.brandId,
        brandSlug: lead.client.brandSlug,
      }),
    onSuccess: () => {
      toast.success('Questionnaire draft ready')
      queryClient.invalidateQueries({ queryKey: ['lead-questionnaires', lead.id] })
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to prepare questionnaire')
    },
  })

  const events = questionnairesQuery.data?.events ?? []
  const questionnaires = useMemo(() => questionnairesQuery.data?.questionnaires ?? [], [questionnairesQuery.data?.questionnaires])

  const [highlightedQuestionnaireId, setHighlightedQuestionnaireId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusQuestionnaireId || !questionnaires.some((item) => item.id === focusQuestionnaireId)) return
    const highlightId = window.setTimeout(() => {
      setHighlightedQuestionnaireId(focusQuestionnaireId)
    }, 0)
    const target = document.getElementById(`lead-questionnaire-${focusQuestionnaireId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const timeout = window.setTimeout(() => {
      setHighlightedQuestionnaireId((current) => (current === focusQuestionnaireId ? null : current))
    }, 2400)

    return () => {
      window.clearTimeout(highlightId)
      window.clearTimeout(timeout)
    }
  }, [focusQuestionnaireId, questionnaires])

  return (
    <Card title="Questionnaires" className="p-4">
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
            Prepare Questionnaire
          </button>
        </div>

        {questionnairesQuery.isLoading ? <p className="text-sm text-brand-muted">Loading questionnaires…</p> : null}

        <div className="space-y-3">
          {questionnaires.map((item) => (
            <article
              key={item.id}
              id={`lead-questionnaire-${item.id}`}
              className={[
                'rounded-2xl border bg-surface-muted/40 p-3 transition',
                highlightedQuestionnaireId === item.id ? 'border-brand-primary/70 ring-1 ring-brand-primary/60' : 'border-border/40',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white">{item.eventTitle}</p>
                  <p className="mt-1 text-xs text-brand-muted">Updated {formatDate(item.updatedAt)}</p>
                </div>
                <StatusPill label={item.status} />
              </div>
            </article>
          ))}
        </div>

        {!questionnairesQuery.isLoading && !questionnaires.length ? (
          <p className="text-sm text-brand-muted">No questionnaires linked to this lead yet.</p>
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
