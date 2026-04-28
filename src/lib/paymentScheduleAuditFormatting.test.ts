import { describe, expect, it } from 'vitest'
import {
  buildPaymentScheduleAuditActorLabel,
  formatPaymentScheduleAuditActionLabel,
  formatPaymentScheduleAuditHistoryItem,
  formatPaymentScheduleAuditSummary,
  formatPaymentScheduleAuditTimestamp,
} from '@/lib/paymentScheduleAuditFormatting'

describe('paymentScheduleAuditFormatting', () => {
  it('builds actor label with name and email', () => {
    expect(buildPaymentScheduleAuditActorLabel({ fullName: 'Jane Doe', email: 'jane@example.com' }))
      .toBe('Jane Doe <jane@example.com>')
  })

  it('formats known action labels', () => {
    expect(formatPaymentScheduleAuditActionLabel('applied_explicit_schedule')).toBe('Applied explicit schedule')
    expect(formatPaymentScheduleAuditActionLabel('cleared_explicit_schedule')).toBe('Cleared explicit schedule')
  })

  it('falls back for unknown action labels', () => {
    expect(formatPaymentScheduleAuditActionLabel('other_action')).toBe('Updated schedule')
  })

  it('keeps invalid timestamps unchanged', () => {
    expect(formatPaymentScheduleAuditTimestamp('not-a-date')).toBe('not-a-date')
  })

  it('formats summary and history strings', () => {
    const event = {
      action: 'applied_explicit_schedule',
      at: '2026-04-23T10:00:00.000Z',
      scheduleId: 'standard',
      performedBy: 'Jane Doe <jane@example.com>',
    }

    expect(formatPaymentScheduleAuditHistoryItem(event)).toBe('Applied explicit schedule by Jane Doe <jane@example.com>')
    expect(formatPaymentScheduleAuditSummary(event)).toContain('Applied explicit schedule at')
    expect(formatPaymentScheduleAuditSummary(event)).toContain('(standard)')
  })
})
