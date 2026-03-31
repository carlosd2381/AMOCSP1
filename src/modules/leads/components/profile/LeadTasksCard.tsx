import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { type LeadRecord } from '@/types'
import {
  createLeadTask,
  deleteLeadTask,
  fetchLeadTasks,
  updateLeadTaskStatus,
  type LeadTaskStatus,
} from '@/services/leadTasksService'

interface LeadTasksCardProps {
  lead: LeadRecord
}

const INPUT_CLASS =
  'input-compact w-full'

export function LeadTasksCard({ lead }: LeadTasksCardProps) {
  const queryClient = useQueryClient()
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')

  const tasksQuery = useQuery({
    queryKey: ['lead-tasks', lead.id],
    queryFn: () => fetchLeadTasks(lead.id),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createLeadTask({
        leadId: lead.id,
        title: newTaskTitle,
        dueAt: newTaskDueDate || undefined,
        brandId: lead.client.brandId,
        brandSlug: lead.client.brandSlug,
      }),
    onSuccess: () => {
      setNewTaskTitle('')
      setNewTaskDueDate('')
      queryClient.invalidateQueries({ queryKey: ['lead-tasks', lead.id] })
      toast.success('Task added')
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to add task')
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: LeadTaskStatus }) =>
      updateLeadTaskStatus(taskId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-tasks', lead.id] }),
    onError: (error) => {
      console.error(error)
      toast.error('Unable to update task')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => deleteLeadTask(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-tasks', lead.id] }),
    onError: (error) => {
      console.error(error)
      toast.error('Unable to remove task')
    },
  })

  return (
    <Card title="To do's" className="p-4">
      <div className="space-y-2.5">
        <div className="grid gap-2">
          <input
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            placeholder="Add a task"
            className={INPUT_CLASS}
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={newTaskDueDate}
              onChange={(event) => setNewTaskDueDate(event.target.value)}
              className={INPUT_CLASS}
            />
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newTaskTitle.trim()}
              className="btn-compact-primary"
            >
              Add
            </button>
          </div>
        </div>

        {tasksQuery.isLoading ? <p className="text-sm text-brand-muted">Loading tasks…</p> : null}

        <div className="space-y-2">
          {(tasksQuery.data ?? []).map((task) => {
            const nextStatus: LeadTaskStatus = task.status === 'done' ? 'open' : 'done'
            return (
              <div key={task.id} className="rounded-2xl border border-border/40 bg-surface-muted/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => statusMutation.mutate({ taskId: task.id, status: nextStatus })}
                    className="text-left"
                  >
                    <p className={`text-sm ${task.status === 'done' ? 'text-brand-muted line-through' : 'text-white'}`}>
                      {task.title}
                    </p>
                    <p className="mt-1 text-xs text-brand-muted">{formatDueDate(task.dueAt)}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(task.id)}
                    className="btn-compact-secondary"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
          {!tasksQuery.isLoading && !(tasksQuery.data?.length ?? 0) ? (
            <p className="text-sm text-brand-muted">No tasks yet for this lead.</p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function formatDueDate(value: string | null) {
  if (!value) return 'No due date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No due date'
  return `Due ${date.toLocaleDateString()}`
}
