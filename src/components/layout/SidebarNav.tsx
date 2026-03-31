import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Building2, CalendarPlus, FileText, FileSignature, ImageDown, Kanban, LayoutDashboard, ListTodo, NotebookPen, Plus, Users2 } from 'lucide-react'
import AmoStudioLogo from '../../../images/AmoStudio_LOGO_2021-01.png'
import clsx from 'clsx'
import { useBranding } from '@/contexts/BrandingContext'
import { createLead, fetchLeadBoard } from '@/services/leadService'
import { createLeadInternalNote } from '@/services/leadNotesService'
import { createLeadTask, type LeadTaskStatus } from '@/services/leadTasksService'
import { createLeadScheduleItem, type LeadScheduleShootType } from '@/services/leadScheduleService'
import { type BrandSlug, type LeadRecord } from '@/types'
import { type LeadProfileTab } from '@/modules/leads/profile/leadProfileTabs'
import { prefetchRouteByPath, trackRouteNavigation } from '@/routes/routePrefetch'

const NAV_ITEMS = [
  { label: 'Overview', to: '/', icon: LayoutDashboard },
  { label: 'Leads & CRM', to: '/leads', icon: Kanban },
  { label: 'Address Book', to: '/address-book', icon: NotebookPen },
  { label: 'Venues', to: '/venues', icon: Building2 },
  { label: 'Quotes', to: '/quotes', icon: FileText },
  { label: 'Contracts', to: '/contracts', icon: FileSignature },
  { label: 'Galleries', to: '/galleries', icon: ImageDown },
  { label: 'Client Portal', to: '/portal/preview', icon: Users2 },
]

interface LeadQuickDraft {
  name: string
  email: string
  eventDate: string
  brandSlug: BrandSlug
}

type QuickMode = 'lead' | 'note' | 'task' | 'appointment'

interface QuickLeadRef {
  id: string
  name: string
  brandId?: string
  brandSlug?: BrandSlug
}

interface QuickActionResult {
  leadId: string
  label: string
  tab?: LeadProfileTab
  createdAt: string
}

type QuickActionResults = Partial<Record<QuickMode, QuickActionResult>>
const QUICK_RESULT_TTL_MS = 10 * 60 * 1000

const QUICK_MODE_LABELS: Record<QuickMode, string> = {
  lead: 'Lead',
  note: 'Note',
  task: 'Task',
  appointment: 'Appt',
}

export function SidebarNav() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { brand } = useBranding()
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickMode, setQuickMode] = useState<QuickMode>('lead')

  const [leadDraft, setLeadDraft] = useState<LeadQuickDraft>({
    name: '',
    email: '',
    eventDate: '',
    brandSlug: brand.slug,
  })
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDetails, setTaskDetails] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskStatus, setTaskStatus] = useState<LeadTaskStatus>('open')
  const [appointmentTitle, setAppointmentTitle] = useState('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentStartTime, setAppointmentStartTime] = useState('09:00')
  const [appointmentEndTime, setAppointmentEndTime] = useState('10:00')
  const [appointmentShootType, setAppointmentShootType] = useState<LeadScheduleShootType>('photo')
  const [quickResults, setQuickResults] = useState<QuickActionResults>({})
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now())
    }, 60_000)

    return () => window.clearInterval(intervalId)
  }, [])

  const activeQuickResults = useMemo<QuickActionResults>(() => {
    const entries = Object.entries(quickResults).filter((entry): entry is [QuickMode, QuickActionResult] => {
      const result = entry[1]
      if (!result) return false
      const createdAt = new Date(result.createdAt).getTime()
      if (Number.isNaN(createdAt)) return false
      return nowTimestamp - createdAt < QUICK_RESULT_TTL_MS
    })

    return Object.fromEntries(entries) as QuickActionResults
  }, [nowTimestamp, quickResults])

  const quickLeadsQuery = useQuery({
    queryKey: ['lead-board', brand.slug, 'quick-actions'],
    queryFn: () => fetchLeadBoard(brand.slug),
    enabled: quickOpen,
  })

  const availableLeads = useMemo<QuickLeadRef[]>(() => {
    const board = quickLeadsQuery.data
    if (!board) return []

    return Object.values(board)
      .flat()
      .map((lead: LeadRecord) => ({
        id: lead.id,
        name: lead.client.name,
        brandId: lead.client.brandId,
        brandSlug: lead.client.brandSlug,
      }))
  }, [quickLeadsQuery.data])

  const selectedLead = useMemo(
    () => availableLeads.find((lead) => lead.id === selectedLeadId) ?? availableLeads[0],
    [availableLeads, selectedLeadId],
  )

  const createLeadMutation = useMutation({
    mutationFn: createLead,
    onSuccess: async (record) => {
      setLeadDraft((current) => ({
        ...current,
        name: '',
        email: '',
        eventDate: '',
      }))
      toast.success('Lead added to CRM')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lead-board'] }),
        queryClient.invalidateQueries({ queryKey: ['lead-board', record.client.brandSlug] }),
      ])
      setQuickResults((current) => ({
        ...current,
        lead: {
          leadId: record.id,
          label: `${record.client.name} created`,
          tab: 'overview',
          createdAt: new Date().toISOString(),
        },
      }))
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to quick add lead')
    },
  })

  const createNoteMutation = useMutation({
    mutationFn: createLeadInternalNote,
    onSuccess: async (_result, variables) => {
      setNoteBody('')
      toast.success('Quick note added')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lead-internal-notes', variables.leadId] }),
        queryClient.invalidateQueries({ queryKey: ['lead-activity', variables.leadId] }),
      ])
      setQuickResults((current) => ({
        ...current,
        note: { leadId: variables.leadId, label: 'Note added', tab: 'tasks', createdAt: new Date().toISOString() },
      }))
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to add quick note')
    },
  })

  const createTaskMutation = useMutation({
    mutationFn: createLeadTask,
    onSuccess: async (_result, variables) => {
      setTaskTitle('')
      setTaskDetails('')
      setTaskDueDate('')
      setTaskStatus('open')
      toast.success('Quick task added')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lead-tasks', variables.leadId] }),
        queryClient.invalidateQueries({ queryKey: ['lead-activity', variables.leadId] }),
      ])
      setQuickResults((current) => ({
        ...current,
        task: { leadId: variables.leadId, label: 'Task added', tab: 'tasks', createdAt: new Date().toISOString() },
      }))
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to add quick task')
    },
  })

  const createAppointmentMutation = useMutation({
    mutationFn: createLeadScheduleItem,
    onSuccess: async (_result, variables) => {
      setAppointmentTitle('')
      setAppointmentDate('')
      setAppointmentStartTime('09:00')
      setAppointmentEndTime('10:00')
      setAppointmentShootType('photo')
      toast.success('Quick appointment added')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lead-schedule', variables.leadId] }),
        queryClient.invalidateQueries({ queryKey: ['lead-overview', variables.leadId] }),
        queryClient.invalidateQueries({ queryKey: ['lead-activity', variables.leadId] }),
      ])
      setQuickResults((current) => ({
        ...current,
        appointment: { leadId: variables.leadId, label: 'Appointment added', tab: 'schedule', createdAt: new Date().toISOString() },
      }))
    },
    onError: (error) => {
      console.error(error)
      toast.error('Unable to add quick appointment')
    },
  })

  const submitLeadQuickAdd = async () => {
    if (!leadDraft.name.trim() || !leadDraft.email.trim() || !leadDraft.eventDate) {
      toast.error('Name, email, and event date are required')
      return
    }

    await createLeadMutation.mutateAsync({
      client: {
        name: leadDraft.name.trim(),
        email: leadDraft.email.trim(),
        type: leadDraft.brandSlug === 'amo' ? 'couple' : 'corporate',
      },
      eventDate: leadDraft.eventDate,
      notes: 'Quick capture',
      source: 'Sidebar quick add',
      brandSlug: leadDraft.brandSlug,
    })
  }

  const submitQuickNote = async () => {
    if (!selectedLead) {
      toast.error('Select a lead first')
      return
    }

    if (!noteBody.trim()) {
      toast.error('Note body is required')
      return
    }

    await createNoteMutation.mutateAsync({
      leadId: selectedLead.id,
      body: noteBody,
      brandId: selectedLead.brandId,
      brandSlug: selectedLead.brandSlug ?? brand.slug,
    })
  }

  const submitQuickTask = async () => {
    if (!selectedLead) {
      toast.error('Select a lead first')
      return
    }

    if (!taskTitle.trim()) {
      toast.error('Task title is required')
      return
    }

    await createTaskMutation.mutateAsync({
      leadId: selectedLead.id,
      title: taskTitle,
      details: taskDetails,
      dueAt: taskDueDate || undefined,
      status: taskStatus,
      brandId: selectedLead.brandId,
      brandSlug: selectedLead.brandSlug ?? brand.slug,
    })
  }

  const submitQuickAppointment = async () => {
    if (!selectedLead) {
      toast.error('Select a lead first')
      return
    }

    if (!appointmentTitle.trim() || !appointmentDate || !appointmentStartTime || !appointmentEndTime) {
      toast.error('Title, date, and times are required')
      return
    }

    await createAppointmentMutation.mutateAsync({
      leadId: selectedLead.id,
      title: appointmentTitle,
      date: appointmentDate,
      startTime: appointmentStartTime,
      endTime: appointmentEndTime,
      shootType: appointmentShootType,
      brandId: selectedLead.brandId,
      brandSlug: selectedLead.brandSlug ?? brand.slug,
    })
  }

  const openQuickResult = (result: QuickActionResult | undefined) => {
    if (!result) return
    trackRouteNavigation('/leads/:leadId')
    const query = result.tab ? `?tab=${result.tab}` : ''
    navigate(`/leads/${result.leadId}${query}`)
  }

  const clearQuickResult = (mode: QuickMode) => {
    setQuickResults((current) => {
      const next = { ...current }
      delete next[mode]
      return next
    })
  }

  return (
    <aside className="flex h-full flex-col rounded-4xl border border-border/30 bg-surface-muted/60 p-4 lg:p-5">
      <div>
        <div className="mb-5">
          <img
            src={AmoStudioLogo}
            alt="AMO Studio logo"
            className="h-10 w-auto"
          />
        </div>

        <div className="mb-4 space-y-2">
          <button
            type="button"
            onClick={() => {
              setQuickOpen((current) => {
                const next = !current
                if (next) {
                  setLeadDraft((draft) => ({
                    ...draft,
                    brandSlug: brand.slug,
                  }))
                  setSelectedLeadId('')
                }
                return next
              })
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-brand-primary/40 bg-brand-primary/20 px-3 py-2 text-xs font-semibold tracking-[0.16em] text-white transition hover:border-brand-primary/70"
          >
            <Plus size={14} />
            Quick +
          </button>

          {quickOpen ? (
            <div className="space-y-2 rounded-2xl border border-border/40 bg-surface/70 p-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setQuickMode('lead')}
                  className="btn-compact-secondary flex w-full items-center justify-center gap-2"
                >
                  <Plus size={13} />
                  Lead
                </button>
                <button
                  type="button"
                  onClick={() => setQuickMode('note')}
                  className="btn-compact-secondary flex w-full items-center justify-center gap-2"
                >
                  <NotebookPen size={13} />
                  Note
                </button>
                <button
                  type="button"
                  onClick={() => setQuickMode('task')}
                  className="btn-compact-secondary flex w-full items-center justify-center gap-2"
                >
                  <ListTodo size={13} />
                  Task
                </button>
                <button
                  type="button"
                  onClick={() => setQuickMode('appointment')}
                  className="btn-compact-secondary flex w-full items-center justify-center gap-2"
                >
                  <CalendarPlus size={13} />
                  Appt
                </button>
              </div>

              {Object.keys(activeQuickResults).length ? (
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(activeQuickResults) as QuickMode[]).map((mode) => (
                    <div key={mode} className="flex items-center gap-1 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-2 py-1">
                      <button
                        type="button"
                        onClick={() => openQuickResult(activeQuickResults[mode])}
                        className="text-[11px] text-emerald-100 transition hover:text-emerald-50"
                      >
                        {QUICK_MODE_LABELS[mode]} {activeQuickResults[mode] ? formatChipTime(activeQuickResults[mode]!.createdAt) : 'ready'}
                      </button>
                      <button
                        type="button"
                        onClick={() => clearQuickResult(mode)}
                        className="text-[10px] text-emerald-200/80 transition hover:text-emerald-100"
                        aria-label={`Clear ${QUICK_MODE_LABELS[mode]} quick result`}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="my-1 border-t border-border/20" />

              {quickMode === 'lead' ? (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-brand-muted">Quick lead</p>
                  <input
                    value={leadDraft.name}
                    onChange={(event) => setLeadDraft((current) => ({ ...current, name: event.target.value }))}
                    className="input-compact w-full"
                    placeholder="Client name"
                  />
                  <input
                    value={leadDraft.email}
                    onChange={(event) => setLeadDraft((current) => ({ ...current, email: event.target.value }))}
                    className="input-compact w-full"
                    placeholder="client@email.com"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={leadDraft.eventDate}
                      onChange={(event) => setLeadDraft((current) => ({ ...current, eventDate: event.target.value }))}
                      className="input-compact w-full"
                    />
                    <select
                      value={leadDraft.brandSlug}
                      onChange={(event) => setLeadDraft((current) => ({ ...current, brandSlug: event.target.value as BrandSlug }))}
                      className="select-compact w-full"
                    >
                      <option value="amo">AMO</option>
                      <option value="csp">CSP</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void submitLeadQuickAdd()}
                    disabled={createLeadMutation.isPending}
                    className="btn-compact-primary w-full"
                  >
                    {createLeadMutation.isPending ? 'Adding…' : 'Add Lead'}
                  </button>
                </div>
              ) : null}

              {quickMode !== 'lead' ? (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-brand-muted">Lead</p>
                  <select
                    value={selectedLead?.id ?? ''}
                    onChange={(event) => setSelectedLeadId(event.target.value)}
                    className="select-compact w-full"
                  >
                    {!availableLeads.length ? <option value="">No leads available</option> : null}
                    {availableLeads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.name}
                      </option>
                    ))}
                  </select>
                  {quickLeadsQuery.isLoading ? <p className="text-xs text-brand-muted">Loading leads…</p> : null}
                </div>
              ) : null}

              {quickMode === 'note' ? (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    className="input-compact w-full"
                    placeholder="Quick internal note"
                  />
                  <button
                    type="button"
                    onClick={() => void submitQuickNote()}
                    disabled={createNoteMutation.isPending || !availableLeads.length}
                    className="btn-compact-primary w-full"
                  >
                    {createNoteMutation.isPending ? 'Saving…' : 'Add Note'}
                  </button>
                </div>
              ) : null}

              {quickMode === 'task' ? (
                <div className="space-y-2">
                  <input
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    className="input-compact w-full"
                    placeholder="Task title"
                  />
                  <textarea
                    rows={2}
                    value={taskDetails}
                    onChange={(event) => setTaskDetails(event.target.value)}
                    className="input-compact w-full"
                    placeholder="Details (optional)"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={taskDueDate}
                      onChange={(event) => setTaskDueDate(event.target.value)}
                      className="input-compact w-full"
                    />
                    <select
                      value={taskStatus}
                      onChange={(event) => setTaskStatus(event.target.value as LeadTaskStatus)}
                      className="select-compact w-full"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void submitQuickTask()}
                    disabled={createTaskMutation.isPending || !availableLeads.length}
                    className="btn-compact-primary w-full"
                  >
                    {createTaskMutation.isPending ? 'Saving…' : 'Add Task'}
                  </button>
                </div>
              ) : null}

              {quickMode === 'appointment' ? (
                <div className="space-y-2">
                  <input
                    value={appointmentTitle}
                    onChange={(event) => setAppointmentTitle(event.target.value)}
                    className="input-compact w-full"
                    placeholder="Appointment title"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={appointmentDate}
                      onChange={(event) => setAppointmentDate(event.target.value)}
                      className="input-compact w-full"
                    />
                    <select
                      value={appointmentShootType}
                      onChange={(event) => setAppointmentShootType(event.target.value as LeadScheduleShootType)}
                      className="select-compact w-full"
                    >
                      <option value="photo">Photo</option>
                      <option value="video">Video</option>
                      <option value="drone">Drone</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={appointmentStartTime}
                      onChange={(event) => setAppointmentStartTime(event.target.value)}
                      className="input-compact w-full"
                    />
                    <input
                      type="time"
                      value={appointmentEndTime}
                      onChange={(event) => setAppointmentEndTime(event.target.value)}
                      className="input-compact w-full"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void submitQuickAppointment()}
                    disabled={createAppointmentMutation.isPending || !availableLeads.length}
                    className="btn-compact-primary w-full"
                  >
                    {createAppointmentMutation.isPending ? 'Saving…' : 'Add Appointment'}
                  </button>
                </div>
              ) : null}

              {activeQuickResults[quickMode] ? (
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-2">
                  <p className="text-xs text-emerald-200">
                    {activeQuickResults[quickMode]?.label} • {formatChipTime(activeQuickResults[quickMode]!.createdAt)}
                  </p>
                  <button
                    type="button"
                    onClick={() => openQuickResult(activeQuickResults[quickMode])}
                    className="mt-1 w-full rounded-xl border border-emerald-300/40 px-2 py-1 text-xs text-emerald-100 transition hover:border-emerald-200/60"
                  >
                    Open lead
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <nav className="space-y-0.5">
          {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onMouseEnter={() => prefetchRouteByPath(to)}
              onFocus={() => prefetchRouteByPath(to)}
              onClick={() => trackRouteNavigation(to)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-2xl px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-brand-primary/15 text-white ring-1 ring-inset ring-brand-primary/50'
                    : 'text-brand-muted hover:bg-border/10',
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  )
}

function formatChipTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'now'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
