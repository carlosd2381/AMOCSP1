export interface PaymentScheduleAuditEventLike {
  action: string
  at: string
  performedBy?: string
  scheduleId?: string
}

export function buildPaymentScheduleAuditActorLabel(input: {
  fullName?: string | null
  email?: string | null
}) {
  const email = (input.email ?? '').trim()
  const fullName = (input.fullName ?? '').trim()

  if (fullName && email && fullName.toLowerCase() !== email.toLowerCase()) {
    return `${fullName} <${email}>`
  }

  return email || fullName || 'unknown-user'
}

export function formatPaymentScheduleAuditActionLabel(action: string) {
  if (action === 'applied_explicit_schedule') return 'Applied explicit schedule'
  if (action === 'cleared_explicit_schedule') return 'Cleared explicit schedule'
  return 'Updated schedule'
}

export function formatPaymentScheduleAuditTimestamp(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export function formatPaymentScheduleAuditSummary(event: PaymentScheduleAuditEventLike) {
  const action = formatPaymentScheduleAuditActionLabel(event.action)
  const timestamp = formatPaymentScheduleAuditTimestamp(event.at)
  const schedule = event.scheduleId ? ` (${event.scheduleId})` : ''
  const actor = event.performedBy ? ` by ${event.performedBy}` : ''
  return `${action} at ${timestamp}${schedule}${actor}`
}

export function formatPaymentScheduleAuditHistoryItem(event: PaymentScheduleAuditEventLike) {
  const action = formatPaymentScheduleAuditActionLabel(event.action)
  const actor = event.performedBy ? ` by ${event.performedBy}` : ''
  return `${action}${actor}`
}
