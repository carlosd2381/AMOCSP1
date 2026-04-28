import { type PaymentScheduleTemplateEntry } from '@/services/paymentScheduleSettingsService'

export interface ComputedPaymentScheduleEntry {
  id: string
  label: string
  percentage: number
  amount: number
  dueDate: string
}

interface BuildPaymentScheduleFromTemplatesInput {
  templates: PaymentScheduleTemplateEntry[]
  totalAmount: number
  keyDates: {
    issuedAt: string
    orderBookedAt?: string
    acceptanceDate?: string
    deliveryDate?: string
    jobDate?: string
  }
}

export function buildPaymentScheduleFromTemplates(
  input: BuildPaymentScheduleFromTemplatesInput,
): ComputedPaymentScheduleEntry[] {
  if (!Number.isFinite(input.totalAmount) || input.totalAmount <= 0) {
    return []
  }

  const validTemplates = input.templates
    .filter((entry) => Number.isFinite(entry.percentage) && entry.percentage > 0)
    .map((entry) => ({
      id: entry.id,
      label: entry.label?.trim() || 'Payment',
      percentage: entry.percentage,
      dueRule: entry.dueRule,
      dueOffsetDays: Math.max(0, Math.round(entry.dueOffsetDays ?? 0)),
    }))

  if (!validTemplates.length) {
    return []
  }

  const totalPercent = validTemplates.reduce((sum, entry) => sum + entry.percentage, 0)
  if (totalPercent <= 0) {
    return []
  }

  let allocated = 0

  return validTemplates.map((entry, index) => {
    const isLast = index === validTemplates.length - 1
    const share = entry.percentage / totalPercent
    const amount = isLast
      ? Number((input.totalAmount - allocated).toFixed(2))
      : Number((input.totalAmount * share).toFixed(2))
    allocated += amount

    return {
      id: entry.id,
      label: entry.label,
      percentage: entry.percentage,
      amount,
      dueDate: resolveDueDateForTemplate({
        keyDates: input.keyDates,
        dueRule: entry.dueRule,
        dueOffsetDays: entry.dueOffsetDays,
      }),
    }
  }).filter((entry) => entry.amount > 0)
}

function resolveDueDateForTemplate(input: {
  keyDates: BuildPaymentScheduleFromTemplatesInput['keyDates']
  dueRule: PaymentScheduleTemplateEntry['dueRule']
  dueOffsetDays: number
}) {
  const issuedAt = input.keyDates.issuedAt
  const orderBookedAt = input.keyDates.orderBookedAt ?? issuedAt
  const acceptanceDate = input.keyDates.acceptanceDate ?? issuedAt
  const deliveryDate = input.keyDates.deliveryDate ?? input.keyDates.jobDate ?? issuedAt
  const jobDate = input.keyDates.jobDate ?? issuedAt

  switch (input.dueRule) {
    case 'on_acceptance':
      return acceptanceDate
    case 'on_delivery':
      return deliveryDate
    case 'after_order_booked':
      return addDaysToDate(orderBookedAt, input.dueOffsetDays)
    case 'before_job_date':
      return addDaysToDate(jobDate, -input.dueOffsetDays)
    case 'on_job_date':
      return jobDate
    case 'after_job_date':
      return addDaysToDate(jobDate, input.dueOffsetDays)
    default:
      return issuedAt
  }
}

export function addDaysToDate(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateString
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
