import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useBranding } from '@/contexts/BrandingContext'
import {
  fetchPaymentScheduleSettings,
  savePaymentScheduleSettings,
  type PaymentScheduleDefinition,
  type PaymentScheduleDueRule,
  type PaymentScheduleSettings,
  type PaymentScheduleTemplateEntry,
} from '@/services/paymentScheduleSettingsService'
import { addDaysToDate, buildPaymentScheduleFromTemplates } from '@/services/paymentScheduleService'

function emptyDraft(): PaymentScheduleSettings {
  return {
    applyByDefaultWhenMissing: false,
    schedules: [
      {
        id: 'standard',
        name: 'Standard',
        isDefault: true,
        templates: [
          { id: 'deposit', label: 'Deposit', percentage: 50, dueRule: 'on_acceptance', dueOffsetDays: 0 },
          { id: 'final-payment', label: 'Final Payment', percentage: 50, dueRule: 'before_job_date', dueOffsetDays: 7 },
        ],
      },
    ],
  }
}

const DUE_RULE_OPTIONS: Array<{ value: PaymentScheduleDueRule; label: string }> = [
  { value: 'on_acceptance', label: 'On acceptance' },
  { value: 'on_delivery', label: 'On delivery' },
  { value: 'after_order_booked', label: 'After order is booked' },
  { value: 'before_job_date', label: 'Before job date' },
  { value: 'on_job_date', label: 'On job date' },
  { value: 'after_job_date', label: 'After job date' },
]

const DUE_OFFSET_OPTIONS = {
  days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30],
  weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
}

const DUE_OFFSET_PRESET_VALUES = [
  ...DUE_OFFSET_OPTIONS.days,
  ...DUE_OFFSET_OPTIONS.weeks.map((weeks) => weeks * 7),
  ...DUE_OFFSET_OPTIONS.months.map((months) => months * 30),
]

function needsDueOffset(rule: PaymentScheduleDueRule) {
  return rule === 'before_job_date' || rule === 'after_job_date' || rule === 'after_order_booked'
}

function numberInput(value: string, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

export function PaymentSchedulesSettingsPage() {
  const { brand } = useBranding()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<PaymentScheduleSettings>(emptyDraft())
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('standard')

  const settingsQuery = useQuery({
    queryKey: ['settings-payment-schedules', brand.slug],
    queryFn: () => fetchPaymentScheduleSettings(brand.slug),
  })

  useEffect(() => {
    if (!settingsQuery.data) return
    setDraft(settingsQuery.data)
    const defaultSchedule = settingsQuery.data.schedules.find((schedule) => schedule.isDefault)
      ?? settingsQuery.data.schedules[0]
    if (defaultSchedule?.id) {
      setSelectedScheduleId(defaultSchedule.id)
    }
  }, [settingsQuery.data])

  const hasChanges = useMemo(() => {
    if (!settingsQuery.data) return false
    return JSON.stringify(settingsQuery.data) !== JSON.stringify(draft)
  }, [settingsQuery.data, draft])

  const activeSchedule = useMemo(
    () => draft.schedules.find((schedule) => schedule.id === selectedScheduleId) ?? draft.schedules[0] ?? null,
    [draft.schedules, selectedScheduleId],
  )

  const hasTemplateValidationError = useMemo(() => {
    if (!draft.schedules.length) return true
    return draft.schedules.some((schedule) => {
      if (!schedule.name.trim()) return true
      if (!schedule.templates.length) return true

      const total = schedule.templates.reduce((sum, entry) => sum + Math.max(0, Number(entry.percentage || 0)), 0)
      if (total <= 0) return true

      return schedule.templates.some((entry) => !entry.label.trim())
    })
  }, [draft.schedules])

  const activeTotalPercentage = useMemo(() => {
    if (!activeSchedule) return 0
    return activeSchedule.templates.reduce((sum, entry) => sum + Math.max(0, Number(entry.percentage || 0)), 0)
  }, [activeSchedule])

  const previewRows = useMemo(() => {
    if (!activeSchedule) return []

    return buildPaymentScheduleFromTemplates({
      templates: activeSchedule.templates,
      totalAmount: 10000,
      keyDates: {
        issuedAt: new Date().toISOString().slice(0, 10),
        acceptanceDate: new Date().toISOString().slice(0, 10),
        orderBookedAt: new Date().toISOString().slice(0, 10),
        deliveryDate: addDaysToDate(new Date().toISOString().slice(0, 10), 30),
        jobDate: addDaysToDate(new Date().toISOString().slice(0, 10), 30),
      },
    })
  }, [activeSchedule])

  const saveMutation = useMutation({
    mutationFn: () => savePaymentScheduleSettings(brand.slug, draft),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['settings-payment-schedules', brand.slug], saved)
      await queryClient.invalidateQueries({ queryKey: ['settings-payment-schedules', brand.slug] })
      toast.success('Payment schedule settings updated')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to save payment schedule settings')
    },
  })

  const disabled = settingsQuery.isLoading || saveMutation.isPending

  const updateTemplate = (
    scheduleId: string,
    id: string,
    updater: (entry: PaymentScheduleTemplateEntry) => PaymentScheduleTemplateEntry,
  ) => {
    setDraft((prev) => ({
      ...prev,
      schedules: prev.schedules.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule
        return {
          ...schedule,
          templates: schedule.templates.map((entry) => (entry.id === id ? updater(entry) : entry)),
        }
      }),
    }))
  }

  const updateSchedule = (
    scheduleId: string,
    updater: (schedule: PaymentScheduleDefinition) => PaymentScheduleDefinition,
  ) => {
    setDraft((prev) => ({
      ...prev,
      schedules: prev.schedules.map((schedule) => (schedule.id === scheduleId ? updater(schedule) : schedule)),
    }))
  }

  const removeTemplate = (scheduleId: string, id: string) => {
    setDraft((prev) => ({
      ...prev,
      schedules: prev.schedules.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule
        return {
          ...schedule,
          templates: schedule.templates.filter((entry) => entry.id !== id),
        }
      }),
    }))
  }

  const addTemplate = (scheduleId: string) => {
    setDraft((prev) => ({
      ...prev,
      schedules: prev.schedules.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule
        return {
          ...schedule,
          templates: [
            ...schedule.templates,
            {
              id: `template-${Date.now()}`,
              label: `Installment ${schedule.templates.length + 1}`,
              percentage: 0,
              dueRule: 'before_job_date',
              dueOffsetDays: 7,
            },
          ],
        }
      }),
    }))
  }

  const addSchedule = () => {
    setDraft((prev) => {
      const nextIndex = prev.schedules.length + 1
      const nextSchedule: PaymentScheduleDefinition = {
        id: `schedule-${Date.now()}`,
        name: `Schedule ${nextIndex}`,
        isDefault: prev.schedules.length === 0,
        templates: [
          {
            id: `template-${Date.now()}-1`,
            label: 'Deposit',
            percentage: 50,
            dueRule: 'on_acceptance',
            dueOffsetDays: 0,
          },
          {
            id: `template-${Date.now()}-2`,
            label: 'Final Payment',
            percentage: 50,
            dueRule: 'before_job_date',
            dueOffsetDays: 7,
          },
        ],
      }

      const nextDraft = {
        ...prev,
        schedules: [...prev.schedules, nextSchedule],
      }
      setSelectedScheduleId(nextSchedule.id)
      return nextDraft
    })
  }

  const removeSchedule = (scheduleId: string) => {
    setDraft((prev) => {
      const nextSchedules = prev.schedules.filter((schedule) => schedule.id !== scheduleId)
      const normalizedSchedules = nextSchedules.map((schedule, index) => ({
        ...schedule,
        isDefault: nextSchedules.some((entry) => entry.isDefault)
          ? schedule.isDefault
          : index === 0,
      }))

      if (selectedScheduleId === scheduleId && normalizedSchedules[0]?.id) {
        setSelectedScheduleId(normalizedSchedules[0].id)
      }

      return {
        ...prev,
        schedules: normalizedSchedules,
      }
    })
  }

  const setDefaultSchedule = (scheduleId: string) => {
    setDraft((prev) => ({
      ...prev,
      schedules: prev.schedules.map((schedule) => ({
        ...schedule,
        isDefault: schedule.id === scheduleId,
      })),
    }))
  }

  return (
    <div className="space-y-4">
      <Card title="Payment Schedules" className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-brand-muted">
              Define default installment templates for proposals that do not include an explicit payment schedule.
            </p>
            <Link to="/settings" className="mt-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-brand-primary">
              <ArrowLeft size={12} /> Back to settings
            </Link>
          </div>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={disabled || !hasChanges || hasTemplateValidationError}
            className="btn-compact-primary"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Card>

      {settingsQuery.isLoading ? (
        <Card title="Default Template" className="p-4">
          <p className="text-sm text-brand-muted">Loading payment schedule settings...</p>
        </Card>
      ) : (
        <>
          <Card title="Activation" className="p-4">
            <label className="flex items-center justify-between gap-3 text-sm text-white">
              <span>Apply default schedule when proposal has no explicit schedule</span>
              <input
                type="checkbox"
                checked={draft.applyByDefaultWhenMissing}
                onChange={(event) => setDraft((prev) => ({ ...prev, applyByDefaultWhenMissing: event.target.checked }))}
                className="accent-brand-primary"
                disabled={disabled}
              />
            </label>
          </Card>

          <Card title="Schedule Library" className="p-4">
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="space-y-2">
                {draft.schedules.map((schedule) => (
                  <button
                    key={schedule.id}
                    type="button"
                    onClick={() => setSelectedScheduleId(schedule.id)}
                    className={`w-full rounded border px-3 py-2 text-left text-sm ${
                      activeSchedule?.id === schedule.id
                        ? 'border-brand-primary bg-brand-primary/10 text-white'
                        : 'border-border/40 bg-surface-muted/20 text-brand-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{schedule.name || 'Untitled schedule'}</span>
                      {schedule.isDefault ? <span className="text-[10px] uppercase tracking-[0.08em] text-brand-primary">Default</span> : null}
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={addSchedule}
                  disabled={disabled}
                  className="btn-compact-secondary w-full"
                >
                  <Plus size={14} /> Add Schedule
                </button>
              </div>

              {activeSchedule ? (
                <div className="space-y-3">
                  <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                    <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                      Schedule Name
                      <input
                        type="text"
                        value={activeSchedule.name}
                        onChange={(event) => updateSchedule(activeSchedule.id, (current) => ({
                          ...current,
                          name: event.target.value,
                        }))}
                        className="input-compact"
                        disabled={disabled}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setDefaultSchedule(activeSchedule.id)}
                      disabled={disabled || activeSchedule.isDefault}
                      className="btn-compact-secondary"
                    >
                      {activeSchedule.isDefault ? 'Default schedule' : 'Set as default'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSchedule(activeSchedule.id)}
                      disabled={disabled || draft.schedules.length <= 1}
                      className="btn-compact-secondary"
                    >
                      <Trash2 size={14} /> Remove Schedule
                    </button>
                  </div>

                  {activeSchedule.templates.map((entry) => (
                <div key={entry.id} className="grid gap-2 border border-border/40 bg-surface-muted/20 p-3 md:grid-cols-[1fr_120px_220px_auto]">
                  <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                    Label
                    <input
                      type="text"
                      value={entry.label}
                      onChange={(event) => updateTemplate(activeSchedule.id, entry.id, (current) => ({ ...current, label: event.target.value }))}
                      className="input-compact"
                      disabled={disabled}
                    />
                  </label>
                  <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                    Percentage
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={entry.percentage}
                      onChange={(event) => updateTemplate(activeSchedule.id, entry.id, (current) => ({
                        ...current,
                        percentage: numberInput(event.target.value, 0),
                      }))}
                      className="input-compact"
                      disabled={disabled}
                    />
                  </label>
                  <div className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                    <label className="grid gap-1">
                      Due Trigger
                      <select
                        value={entry.dueRule}
                        onChange={(event) => updateTemplate(activeSchedule.id, entry.id, (current) => ({
                          ...current,
                          dueRule: event.target.value as PaymentScheduleDueRule,
                          dueOffsetDays: needsDueOffset(event.target.value as PaymentScheduleDueRule)
                            ? (DUE_OFFSET_PRESET_VALUES.includes(current.dueOffsetDays) ? current.dueOffsetDays : 7)
                            : 0,
                        }))}
                        className="select-compact"
                        disabled={disabled}
                      >
                        {DUE_RULE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    {needsDueOffset(entry.dueRule) && (
                      <label className="grid gap-1">
                        Offset
                        <select
                          value={entry.dueOffsetDays}
                          onChange={(event) => updateTemplate(activeSchedule.id, entry.id, (current) => ({
                            ...current,
                            dueOffsetDays: numberInput(event.target.value, 0),
                          }))}
                          className="select-compact"
                          disabled={disabled}
                        >
                          <optgroup label="Days">
                            {DUE_OFFSET_OPTIONS.days.map((days) => (
                              <option key={`${entry.id}-days-${days}`} value={days}>
                                {days}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Weeks">
                            {DUE_OFFSET_OPTIONS.weeks.map((weeks) => {
                              const value = weeks * 7
                              return (
                                <option key={`${entry.id}-weeks-${weeks}`} value={value}>
                                  {weeks}
                                </option>
                              )
                            })}
                          </optgroup>
                          <optgroup label="Months">
                            {DUE_OFFSET_OPTIONS.months.map((months) => {
                              const value = months * 30
                              return (
                                <option key={`${entry.id}-months-${months}`} value={value}>
                                  {months}
                                </option>
                              )
                            })}
                          </optgroup>
                        </select>
                      </label>
                    )}
                    {needsDueOffset(entry.dueRule) && (
                      <p className="text-[11px] uppercase tracking-[0.08em] text-brand-muted/80">
                        Weeks use 7-day increments, months use 30-day increments.
                      </p>
                    )}
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeTemplate(activeSchedule.id, entry.id)}
                      disabled={disabled || activeSchedule.templates.length <= 1}
                      className="btn-compact-secondary"
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => addTemplate(activeSchedule.id)}
                    disabled={disabled}
                    className="btn-compact-secondary"
                  >
                    <Plus size={14} /> Add Installment
                  </button>

                  <p className="text-xs text-brand-muted">
                    Total configured percentage: <span className="text-white">{activeTotalPercentage.toFixed(2)}%</span>
                    {activeTotalPercentage <= 0 ? ' (must be greater than 0)' : ''}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-brand-muted">No schedules configured.</p>
              )}
            </div>
          </Card>

          <Card title="Impact Preview" className="p-4">
            <div className="border border-border/40 bg-surface-muted/20 p-4 text-sm">
              <p className="text-brand-muted">Sample quote total: 10,000.00 (currency units)</p>
              {activeSchedule ? (
                <p className="text-brand-muted">Previewing schedule: <span className="text-white">{activeSchedule.name}</span></p>
              ) : null}
              {previewRows.length ? (
                <ul className="mt-2 space-y-1">
                  {previewRows.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-2 text-brand-muted">
                      <span>{entry.label} ({entry.percentage.toFixed(2)}%) - due {entry.dueDate}</span>
                      <span className="text-white">{entry.amount.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-brand-muted">No valid payment schedule rows configured.</p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
