import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { LeadInternalNotesTab } from './LeadInternalNotesTab'
import { type LeadRecord } from '@/types'
import {
  createLeadTask,
  deleteLeadTask,
  fetchLeadTasks,
  updateLeadTask,
  updateLeadTaskStatus,
  type LeadTaskRecord,
  type LeadTaskStatus,
} from '@/services/leadTasksService'

interface LeadTasksTabProps {
  lead: LeadRecord
  focusTaskId?: string | null
  focusNoteId?: string | null
}

interface TaskFormValues {
  title: string
  details: string
  dueAt: string
  status: LeadTaskStatus
}

const INPUT_CLASS =
  'input-compact w-full'

const STATUS_COLUMNS: Array<{ status: LeadTaskStatus; label: string }> = [
  { status: 'open', label: 'Open' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'done', label: 'Done' },
]

export function LeadTasksTab({ lead, focusTaskId, focusNoteId }: LeadTasksTabProps) {
  const queryClient = useQueryClient()
  const [newTask, setNewTask] = useState<TaskFormValues>(initialFormValues())
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<TaskFormValues>(initialFormValues())

  const tasksQuery = useQuery({
    queryKey: ['lead-tasks', lead.id],
    queryFn: () => fetchLeadTasks(lead.id),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createLeadTask({
        leadId: lead.id,
        title: newTask.title,
        details: newTask.details,
        dueAt: newTask.dueAt || undefined,
        status: newTask.status,
        brandId: lead.client.brandId,
        brandSlug: lead.client.brandSlug,
      }),
    onSuccess: () => {
      setNewTask(initialFormValues())
      queryClient.invalidateQueries({ queryKey: ['lead-tasks', lead.id] })
      toast.success('Task created')
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to create task')
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingTaskId) {
        throw new Error('Missing task id')
      }
      return updateLeadTask({
        taskId: editingTaskId,
        title: editingTask.title,
        details: editingTask.details,
        dueAt: editingTask.dueAt || undefined,
        status: editingTask.status,
      })
    },
    onSuccess: () => {
      setEditingTaskId(null)
      setEditingTask(initialFormValues())
      queryClient.invalidateQueries({ queryKey: ['lead-tasks', lead.id] })
      toast.success('Task updated')
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to update task')
    },
  })

  const quickStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: LeadTaskStatus }) => updateLeadTaskStatus(taskId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-tasks', lead.id] }),
    onError: (error) => {
      console.error(error)
      toast.error('Unable to update status')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => deleteLeadTask(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-tasks', lead.id] }),
    onError: (error) => {
      console.error(error)
      toast.error('Unable to delete task')
    },
  })

  const groupedTasks = useMemo(() => {
    const source = tasksQuery.data ?? []
    return {
      open: source.filter((task) => task.status === 'open'),
      in_progress: source.filter((task) => task.status === 'in_progress'),
      done: source.filter((task) => task.status === 'done'),
    }
  }, [tasksQuery.data])

  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusTaskId || !tasksQuery.data?.some((task) => task.id === focusTaskId)) return
    const highlightId = window.setTimeout(() => {
      setHighlightedTaskId(focusTaskId)
    }, 0)
    const target = document.getElementById(`lead-task-${focusTaskId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const timeout = window.setTimeout(() => {
      setHighlightedTaskId((current) => (current === focusTaskId ? null : current))
    }, 2400)

    return () => {
      window.clearTimeout(highlightId)
      window.clearTimeout(timeout)
    }
  }, [focusTaskId, tasksQuery.data])

  return (
    <div className="space-y-4">
      <Card title="Tasks" className="p-4">
        <div className="space-y-2.5">
          <TaskForm
            values={newTask}
            onChange={setNewTask}
            submitLabel="Add Task"
            onSubmit={() => createMutation.mutate()}
            isSubmitting={createMutation.isPending}
          />

          {tasksQuery.isLoading ? <p className="text-sm text-brand-muted">Loading tasks…</p> : null}

          <div className="grid gap-4 lg:grid-cols-3">
            {STATUS_COLUMNS.map((column) => (
              <section key={column.status} className="rounded-2xl border border-border/40 bg-surface-muted/40 p-3">
                <h3 className="text-sm font-semibold text-white">{column.label}</h3>
                <div className="mt-3 space-y-2">
                  {groupedTasks[column.status].map((task) => {
                    const isEditing = editingTaskId === task.id
                    const isHighlighted = highlightedTaskId === task.id
                    return (
                      <article
                        key={task.id}
                        id={`lead-task-${task.id}`}
                        className={[
                          'rounded-xl border bg-surface/70 p-3 transition',
                          isHighlighted ? 'border-brand-primary/70 ring-1 ring-brand-primary/60' : 'border-border/40',
                        ].join(' ')}
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <TaskForm
                              values={editingTask}
                              onChange={setEditingTask}
                              submitLabel="Save"
                              onSubmit={() => updateMutation.mutate()}
                              isSubmitting={updateMutation.isPending}
                              compact
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTaskId(null)
                                setEditingTask(initialFormValues())
                              }}
                              className="btn-compact-secondary"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-white">{task.title}</p>
                            {task.details ? <p className="mt-1 text-xs text-brand-muted">{task.details}</p> : null}
                            <p className="mt-1 text-xs text-brand-muted">{formatDueDate(task.dueAt)}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <select
                                value={task.status}
                                onChange={(event) =>
                                  quickStatusMutation.mutate({
                                    taskId: task.id,
                                    status: event.target.value as LeadTaskStatus,
                                  })
                                }
                                className="select-compact"
                              >
                                <option value="open">open</option>
                                <option value="in_progress">in progress</option>
                                <option value="done">done</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => beginEdit(task, setEditingTaskId, setEditingTask)}
                                className="btn-compact-secondary"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteMutation.mutate(task.id)}
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
                  {!groupedTasks[column.status].length ? (
                    <p className="text-xs text-brand-muted">No tasks in this stage.</p>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </div>
      </Card>
      <LeadInternalNotesTab lead={lead} focusNoteId={focusNoteId} title="Notes" />
    </div>
  )
}

function initialFormValues(): TaskFormValues {
  return {
    title: '',
    details: '',
    dueAt: '',
    status: 'open',
  }
}

function TaskForm({
  values,
  onChange,
  onSubmit,
  submitLabel,
  isSubmitting,
  compact = false,
}: {
  values: TaskFormValues
  onChange: (values: TaskFormValues) => void
  onSubmit: () => void
  submitLabel: string
  isSubmitting: boolean
  compact?: boolean
}) {
  return (
    <div className="grid gap-2">
      <input
        value={values.title}
        onChange={(event) => onChange({ ...values, title: event.target.value })}
        className={INPUT_CLASS}
        placeholder="Task title"
      />
      <textarea
        rows={compact ? 2 : 3}
        value={values.details}
        onChange={(event) => onChange({ ...values, details: event.target.value })}
        className={INPUT_CLASS}
        placeholder="Details"
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          type="date"
          value={values.dueAt}
          onChange={(event) => onChange({ ...values, dueAt: event.target.value })}
          className={INPUT_CLASS}
        />
        <select
          value={values.status}
          onChange={(event) => onChange({ ...values, status: event.target.value as LeadTaskStatus })}
          className={INPUT_CLASS}
        >
          <option value="open">open</option>
          <option value="in_progress">in progress</option>
          <option value="done">done</option>
        </select>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting || !values.title.trim()}
          className="btn-compact-primary"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

function beginEdit(
  task: LeadTaskRecord,
  setEditingTaskId: (id: string) => void,
  setEditingTask: (values: TaskFormValues) => void,
) {
  setEditingTaskId(task.id)
  setEditingTask({
    title: task.title,
    details: task.details ?? '',
    dueAt: toDateInput(task.dueAt),
    status: task.status,
  })
}

function toDateInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function formatDueDate(value: string | null) {
  if (!value) return 'No due date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No due date'
  return `Due ${date.toLocaleDateString()}`
}
