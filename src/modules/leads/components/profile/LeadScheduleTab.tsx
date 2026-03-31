import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { type LeadRecord } from '@/types'
import {
  createLeadScheduleItem,
  deleteLeadScheduleItem,
  fetchLeadSchedule,
  updateLeadScheduleItem,
  type LeadScheduleItem,
} from '@/services/leadScheduleService'
import { ScheduleEventForm, toScheduleFormValues, type ScheduleEventFormValues } from './ScheduleEventForm'

interface LeadScheduleTabProps {
  lead: LeadRecord
}

export function LeadScheduleTab({ lead }: LeadScheduleTabProps) {
  const queryClient = useQueryClient()
  const [newValues, setNewValues] = useState<ScheduleEventFormValues>(initialFormValues())
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editingValues, setEditingValues] = useState<ScheduleEventFormValues>(initialFormValues())

  const scheduleQuery = useQuery({
    queryKey: ['lead-schedule', lead.id],
    queryFn: () => fetchLeadSchedule(lead.id),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createLeadScheduleItem({
        leadId: lead.id,
        brandId: lead.client.brandId,
        brandSlug: lead.client.brandSlug,
        ...newValues,
      }),
    onSuccess: () => {
      setNewValues(initialFormValues())
      toast.success('Schedule item created')
      queryClient.invalidateQueries({ queryKey: ['lead-schedule', lead.id] })
      queryClient.invalidateQueries({ queryKey: ['lead-overview', lead.id] })
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to create schedule item')
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingEventId) {
        throw new Error('Missing event id')
      }
      return updateLeadScheduleItem({
        eventId: editingEventId,
        ...editingValues,
      })
    },
    onSuccess: () => {
      setEditingEventId(null)
      setEditingValues(initialFormValues())
      toast.success('Schedule item updated')
      queryClient.invalidateQueries({ queryKey: ['lead-schedule', lead.id] })
      queryClient.invalidateQueries({ queryKey: ['lead-overview', lead.id] })
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to update schedule item')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => deleteLeadScheduleItem(eventId),
    onSuccess: () => {
      toast.success('Schedule item removed')
      queryClient.invalidateQueries({ queryKey: ['lead-schedule', lead.id] })
      queryClient.invalidateQueries({ queryKey: ['lead-overview', lead.id] })
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to delete schedule item')
    },
  })

  const groupedItems = useMemo(() => groupByDate(scheduleQuery.data ?? []), [scheduleQuery.data])

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card title="Event Schedule" className="p-4 xl:col-span-2">
        <div className="space-y-3">
          <p className="text-sm text-brand-muted">
            {lead.client.type === 'couple'
              ? 'AMO-friendly single-day timeline, while still allowing multiple blocks.'
              : 'CSP multi-day planning. Add as many date/time blocks as needed.'}
          </p>

          <ScheduleEventForm
            values={newValues}
            onChange={setNewValues}
            onSubmit={() => createMutation.mutate()}
            submitLabel="Add Schedule Item"
            isSubmitting={createMutation.isPending}
          />

          {scheduleQuery.isLoading ? <p className="text-sm text-brand-muted">Loading schedule…</p> : null}

          <div className="space-y-3">
            {groupedItems.map(({ date, items }) => (
              <section key={date} className="rounded-2xl border border-border/40 bg-surface-muted/40 p-3">
                <h3 className="text-sm font-semibold text-white">{formatDisplayDate(date)}</h3>
                <div className="mt-3 space-y-3">
                  {items.map((item) => {
                    const isEditing = editingEventId === item.id
                    return (
                      <article key={item.id} className="rounded-xl border border-border/40 bg-surface/60 p-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <ScheduleEventForm
                              values={editingValues}
                              onChange={setEditingValues}
                              onSubmit={() => updateMutation.mutate()}
                              submitLabel="Save"
                              isSubmitting={updateMutation.isPending}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEventId(null)
                                setEditingValues(initialFormValues())
                              }}
                              className="rounded-xl border border-border/50 px-3 py-1 text-xs text-brand-muted"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-white">{item.title}</p>
                              <p className="text-xs text-brand-muted">
                                {item.startTime} - {item.endTime} • {item.shootType}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEventId(item.id)
                                  setEditingValues(toScheduleFormValues(item))
                                }}
                                className="rounded-xl border border-border/50 px-3 py-1 text-xs text-brand-muted hover:text-white"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteMutation.mutate(item.id)}
                                className="rounded-xl border border-border/50 px-3 py-1 text-xs text-brand-muted hover:text-white"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          {!scheduleQuery.isLoading && !groupedItems.length ? (
            <p className="text-sm text-brand-muted">No schedule items yet.</p>
          ) : null}
        </div>
      </Card>

      <Card title="Timeline Builder" className="p-4">
        <div className="rounded-2xl border border-dashed border-border/50 bg-surface-muted/40 p-4">
          <p className="text-sm text-brand-muted">
            Next step: convert schedule items into a drag-and-drop timeline with production phases and staffing.
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-brand-muted/80">Placeholder section</p>
        </div>
      </Card>
    </div>
  )
}

function initialFormValues(): ScheduleEventFormValues {
  return {
    title: '',
    date: '',
    startTime: '09:00',
    endTime: '10:00',
    shootType: 'photo',
  }
}

function groupByDate(items: LeadScheduleItem[]) {
  const map = new Map<string, LeadScheduleItem[]>()
  for (const item of items) {
    const list = map.get(item.date) ?? []
    list.push(item)
    map.set(item.date, list)
  }
  return Array.from(map.entries())
    .map(([date, grouped]) => ({ date, items: grouped }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

function formatDisplayDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}
