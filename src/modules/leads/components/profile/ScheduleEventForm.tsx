import { type LeadScheduleItem, type LeadScheduleShootType } from '@/services/leadScheduleService'

export interface ScheduleEventFormValues {
  title: string
  date: string
  startTime: string
  endTime: string
  shootType: LeadScheduleShootType
}

interface ScheduleEventFormProps {
  values: ScheduleEventFormValues
  onChange: (values: ScheduleEventFormValues) => void
  onSubmit: () => void
  submitLabel: string
  isSubmitting?: boolean
}

const INPUT_CLASS =
  'input-compact w-full'

export function ScheduleEventForm({
  values,
  onChange,
  onSubmit,
  submitLabel,
  isSubmitting = false,
}: ScheduleEventFormProps) {
  return (
    <div className="grid gap-2">
      <input
        className={INPUT_CLASS}
        placeholder="Event title"
        value={values.title}
        onChange={(event) => onChange({ ...values, title: event.target.value })}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          type="date"
          className={INPUT_CLASS}
          value={values.date}
          onChange={(event) => onChange({ ...values, date: event.target.value })}
        />
        <input
          type="time"
          className={INPUT_CLASS}
          value={values.startTime}
          onChange={(event) => onChange({ ...values, startTime: event.target.value })}
        />
        <input
          type="time"
          className={INPUT_CLASS}
          value={values.endTime}
          onChange={(event) => onChange({ ...values, endTime: event.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <select
          className={INPUT_CLASS}
          value={values.shootType}
          onChange={(event) => onChange({ ...values, shootType: event.target.value as LeadScheduleShootType })}
        >
          <option value="photo">Photo</option>
          <option value="video">Video</option>
          <option value="drone">Drone</option>
          <option value="hybrid">Hybrid</option>
        </select>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="btn-compact-primary"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function toScheduleFormValues(item: LeadScheduleItem): ScheduleEventFormValues {
  return {
    title: item.title,
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime,
    shootType: item.shootType,
  }
}
