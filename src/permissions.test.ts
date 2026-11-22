import { describe, expect, it } from 'vitest'
import { canEditExpense, canSettle, undoableSettlements } from './permissions'
import { demoTrip, type Trip } from './trips'

const me = { userId: 'u-anna', name: 'anna' }
const now = '2026-11-22T10:00:00.000Z'

function trip(createdBy?: string): Trip {
  const base = demoTrip('t1', now, {
    settlements: [
      { id: 's1', from: 'ben', to: 'anna', amountCents: 100, date: now },
      { id: 's2', from: 'clara', to: 'david', amountCents: 200, date: now },
    ],
  })
  return { ...base, createdBy }
}

describe('canEditExpense', () => {
  const expense = (createdBy?: string) => ({ ...demoTrip('t1', now).expenses[0], createdBy })

  it('allows the author', () => {
    expect(canEditExpense(expense('u-anna'), trip('u-ben'), me)).toBe(true)
  })

  it('allows the trip owner, also for expenses of others', () => {
    expect(canEditExpense(expense('u-ben'), trip('u-anna'), me)).toBe(true)
  })

  it('blocks everyone else', () => {
    expect(canEditExpense(expense('u-ben'), trip('u-ben'), me)).toBe(false)
    expect(canEditExpense(expense(undefined), trip(undefined), me)).toBe(false)
  })

  it('allows everything without an account', () => {
    expect(canEditExpense(expense('u-ben'), trip('u-ben'), null)).toBe(true)
  })
})

describe('canSettle', () => {
  it('only allows payments you are part of', () => {
    expect(canSettle({ from: 'ben', to: 'anna', cents: 1 }, 'anna', me)).toBe(true)
    expect(canSettle({ from: 'anna', to: 'ben', cents: 1 }, 'anna', me)).toBe(true)
    expect(canSettle({ from: 'clara', to: 'ben', cents: 1 }, 'anna', me)).toBe(false)
  })

  it('needs you to be linked to a person in the trip', () => {
    expect(canSettle({ from: 'ben', to: 'anna', cents: 1 }, null, me)).toBe(false)
  })

  it('allows everything without an account', () => {
    expect(canSettle({ from: 'clara', to: 'ben', cents: 1 }, null, null)).toBe(true)
  })
})

describe('undoableSettlements', () => {
  it('only returns repayments you are part of', () => {
    expect(undoableSettlements(trip(), 'anna', me).map((s) => s.id)).toEqual(['s1'])
    expect(undoableSettlements(trip(), null, me)).toEqual([])
    expect(undoableSettlements(trip(), null, null).map((s) => s.id)).toEqual(['s1', 's2'])
  })
})
