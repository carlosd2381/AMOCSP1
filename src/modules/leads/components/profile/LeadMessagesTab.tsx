import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { type LeadRecord } from '@/types'
import {
  createLeadMessage,
  deleteLeadMessage,
  fetchLeadMessages,
  type LeadMessageChannel,
  type LeadMessageDirection,
} from '@/services/leadMessagesService'

interface LeadMessagesTabProps {
  lead: LeadRecord
  focusMessageId?: string | null
}

const INPUT_CLASS =
  'input-compact w-full'

export function LeadMessagesTab({ lead, focusMessageId }: LeadMessagesTabProps) {
  const queryClient = useQueryClient()
  const [channel, setChannel] = useState<LeadMessageChannel>('email')
  const [direction, setDirection] = useState<LeadMessageDirection>('outbound')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const messagesQuery = useQuery({
    queryKey: ['lead-messages', lead.id],
    queryFn: () => fetchLeadMessages(lead.id),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createLeadMessage({
        leadId: lead.id,
        channel,
        direction,
        subject,
        body,
        brandId: lead.client.brandId,
        brandSlug: lead.client.brandSlug,
      }),
    onSuccess: () => {
      setSubject('')
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['lead-messages', lead.id] })
      toast.success('Message logged')
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to log message')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => deleteLeadMessage(messageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-messages', lead.id] }),
    onError: (error) => {
      console.error(error)
      toast.error('Unable to delete message')
    },
  })

  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusMessageId || !messagesQuery.data?.some((message) => message.id === focusMessageId)) return
    const highlightId = window.setTimeout(() => {
      setHighlightedMessageId(focusMessageId)
    }, 0)
    const target = document.getElementById(`lead-message-${focusMessageId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const timeout = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === focusMessageId ? null : current))
    }, 2400)

    return () => {
      window.clearTimeout(highlightId)
      window.clearTimeout(timeout)
    }
  }, [focusMessageId, messagesQuery.data])

  return (
    <Card title="Messages" className="p-4">
      <div className="space-y-3">
        <div className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={channel} onChange={(event) => setChannel(event.target.value as LeadMessageChannel)} className={INPUT_CLASS}>
              <option value="email">email</option>
              <option value="whatsapp">whatsapp</option>
              <option value="instagram">instagram</option>
              <option value="phone">phone</option>
              <option value="internal">internal</option>
            </select>
            <select value={direction} onChange={(event) => setDirection(event.target.value as LeadMessageDirection)} className={INPUT_CLASS}>
              <option value="outbound">outbound</option>
              <option value="inbound">inbound</option>
            </select>
            <input
              className={INPUT_CLASS}
              placeholder="Subject (optional)"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
          <textarea
            rows={3}
            className={INPUT_CLASS}
            placeholder="Message summary"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !body.trim()}
            className="btn-compact-primary w-fit"
          >
            Log Message
          </button>
        </div>

        {messagesQuery.isLoading ? <p className="text-sm text-brand-muted">Loading message timeline…</p> : null}

        <div className="space-y-2">
          {(messagesQuery.data ?? []).map((message) => (
            <article
              key={message.id}
              id={`lead-message-${message.id}`}
              className={[
                'rounded-2xl border bg-surface-muted/40 p-3 transition',
                highlightedMessageId === message.id ? 'border-brand-primary/70 ring-1 ring-brand-primary/60' : 'border-border/40',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusPill label={message.channel} />
                  <StatusPill label={message.direction} />
                </div>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(message.id)}
                  className="btn-compact-secondary"
                >
                  Remove
                </button>
              </div>
              {message.subject ? <p className="mt-2 text-sm font-medium text-white">{message.subject}</p> : null}
              <p className="mt-1 whitespace-pre-wrap text-sm text-brand-muted">{message.body}</p>
              <p className="mt-2 text-xs text-brand-muted">{formatDateTime(message.occurredAt)}</p>
            </article>
          ))}
          {!messagesQuery.isLoading && !(messagesQuery.data?.length ?? 0) ? (
            <p className="text-sm text-brand-muted">No logged messages for this lead yet.</p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}
