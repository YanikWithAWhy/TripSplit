import { describe, expect, it } from 'vitest'
import { computeBalances, totalSpent } from './balances'
import { ExpenseError } from './errors'
import { sumCents } from './test-utils'
import type { Expense } from './types'

const members = ['anna', 'ben', 'clara']

function expense(partial: Partial<Expense> & Pick<Expense, 'amountCents' | 'paidBy'>): Expense {
  return {
    id: crypto.randomUUID(),
    title: 'Test',
    date: '2026-07-14',
    split: { type: 'equal', memberIds: members },
    ...partial,
  }
}

describe('computeBalances', () => {
  it('starts everyone at 0', () => {
    expect([...computeBalances(members, [])]).toEqual([['anna', 0], ['ben', 0], ['clara', 0]])
  })

  it('works out who paid and who owes', () => {
    const balances = computeBalances(members, [expense({ amountCents: 9000, paidBy: 'anna' })])
    expect(Object.fromEntries(balances)).toEqual({ anna: 6000, ben: -3000, clara: -3000 })
  })

  it('ignores deleted expenses', () => {
    const balances = computeBalances(members, [
      expense({ amountCents: 9000, paidBy: 'anna', deletedAt: '2026-07-15T10:00:00Z' }),
    ])
    expect(Object.fromEntries(balances)).toEqual({ anna: 0, ben: 0, clara: 0 })
  })

  it('takes repayments into account', () => {
    const balances = computeBalances(
      members,
      [expense({ amountCents: 9000, paidBy: 'anna' })],
      [{ id: 's1', from: 'ben', to: 'anna', amountCents: 3000, date: '2026-07-16' }],
    )
    expect(Object.fromEntries(balances)).toEqual({ anna: 3000, ben: 0, clara: -3000 })
  })

  it('reports unknown members', () => {
    expect(() => computeBalances(members, [expense({ amountCents: 100, paidBy: 'zoe' })])).toThrow(ExpenseError)
    expect(() => computeBalances(members, [
      expense({ amountCents: 100, paidBy: 'anna', split: { type: 'equal', memberIds: ['zoe'] } }),
    ])).toThrow(/unknown member "zoe"/)
  })

  it('rejects invalid repayments', () => {
    const settle = (from: string, to: string, amountCents: number) =>
      computeBalances(members, [], [{ id: 's', from, to, amountCents, date: '2026-07-16' }])
    expect(() => settle('ben', 'ben', 100)).toThrow(/two different members/)
    expect(() => settle('ben', 'anna', 0)).toThrow(/greater than 0/)
  })

  it('always adds up to 0', () => {
    const balances = computeBalances(members, [
      expense({ amountCents: 10000, paidBy: 'anna' }),
      expense({ amountCents: 3333, paidBy: 'ben', split: { type: 'equal', memberIds: ['ben', 'clara'] } }),
      expense({
        amountCents: 777,
        paidBy: 'clara',
        split: { type: 'shares', shares: [{ memberId: 'anna', weight: 3 }, { memberId: 'ben', weight: 1 }] },
      }),
    ])
    expect(sumCents(balances.values())).toBe(0)
  })
})

describe('totalSpent', () => {
  it('only sums non-deleted expenses', () => {
    expect(totalSpent([
      expense({ amountCents: 1000, paidBy: 'anna' }),
      expense({ amountCents: 500, paidBy: 'ben' }),
      expense({ amountCents: 9999, paidBy: 'ben', deletedAt: '2026-07-15' }),
    ])).toBe(1500)
  })
})
