import { describe, expect, it } from 'vitest'
import { addDaysToDate, buildPaymentScheduleFromTemplates } from '@/services/paymentScheduleService'

describe('paymentScheduleService', () => {
  it('builds schedule rows with normalized percentages and due dates', () => {
    const result = buildPaymentScheduleFromTemplates({
      templates: [
        { id: 'deposit', label: 'Deposit', percentage: 50, dueRule: 'on_acceptance', dueOffsetDays: 0 },
        { id: 'final', label: 'Final', percentage: 50, dueRule: 'before_job_date', dueOffsetDays: 7 },
      ],
      totalAmount: 10000,
      keyDates: {
        issuedAt: '2026-04-17',
        acceptanceDate: '2026-04-17',
        jobDate: '2026-05-01',
      },
    })

    expect(result).toEqual([
      { id: 'deposit', label: 'Deposit', percentage: 50, amount: 5000, dueDate: '2026-04-17' },
      { id: 'final', label: 'Final', percentage: 50, amount: 5000, dueDate: '2026-04-24' },
    ])
  })

  it('preserves total via last-row remainder allocation', () => {
    const result = buildPaymentScheduleFromTemplates({
      templates: [
        { id: 'a', label: 'A', percentage: 33.33, dueRule: 'after_order_booked', dueOffsetDays: 0 },
        { id: 'b', label: 'B', percentage: 33.33, dueRule: 'after_order_booked', dueOffsetDays: 15 },
        { id: 'c', label: 'C', percentage: 33.34, dueRule: 'after_order_booked', dueOffsetDays: 30 },
      ],
      totalAmount: 100,
      keyDates: { issuedAt: '2026-04-17' },
    })

    const total = result.reduce((sum, row) => sum + row.amount, 0)
    expect(total).toBeCloseTo(100, 6)
    expect(result[result.length - 1]?.amount).toBeCloseTo(33.34, 2)
  })

  it('filters out non-positive percentage rows and empty totals', () => {
    const withInvalidRows = buildPaymentScheduleFromTemplates({
      templates: [
        { id: 'x', label: 'X', percentage: 0, dueRule: 'on_acceptance', dueOffsetDays: 0 },
        { id: 'y', label: 'Y', percentage: -20, dueRule: 'on_acceptance', dueOffsetDays: 0 },
      ],
      totalAmount: 1000,
      keyDates: { issuedAt: '2026-04-17' },
    })

    expect(withInvalidRows).toEqual([])

    const withInvalidTotal = buildPaymentScheduleFromTemplates({
      templates: [{ id: 'z', label: 'Z', percentage: 100, dueRule: 'on_acceptance', dueOffsetDays: 0 }],
      totalAmount: 0,
      keyDates: { issuedAt: '2026-04-17' },
    })

    expect(withInvalidTotal).toEqual([])
  })

  it('returns original date when addDaysToDate input is invalid', () => {
    expect(addDaysToDate('not-a-date', 7)).toBe('not-a-date')
  })
})
