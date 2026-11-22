import { describe, expect, it } from 'vitest'
import { computeBalances } from './balances'
import { applyTransfers, settleUp } from './settle'
import { randomInt, seededRandom } from './test-utils'
import type { Expense, SplitSpec } from './types'

const balancesOf = (record: Record<string, number>) => new Map(Object.entries(record))

describe('settleUp', () => {
  it('suggests nothing when everyone is at 0', () => {
    expect(settleUp(new Map())).toEqual([])
    expect(settleUp(balancesOf({ a: 0, b: 0 }))).toEqual([])
  })

  it('lets both debtors pay the one creditor', () => {
    expect(settleUp(balancesOf({ anna: 2000, ben: -1000, clara: -1000 }))).toEqual([
      { from: 'ben', to: 'anna', cents: 1000 },
      { from: 'clara', to: 'anna', cents: 1000 },
    ])
  })

  it('spreads one debt across several creditors', () => {
    expect(settleUp(balancesOf({ a: 5000, b: 3000, c: -4000, d: -4000 }))).toEqual([
      { from: 'c', to: 'a', cents: 4000 },
      { from: 'd', to: 'a', cents: 1000 },
      { from: 'd', to: 'b', cents: 3000 },
    ])
  })

  it('rejects balances that do not add up to 0', () => {
    expect(() => settleUp(balancesOf({ a: 100, b: -99 }))).toThrow(/don't add up to 0/)
  })

  it('always settles random trips completely, with at most n − 1 transfers', () => {
    const random = seededRandom(7)
    for (let run = 0; run < 500; run++) {
      const members = Array.from({ length: randomInt(random, 2, 8) }, (_, i) => `m${i}`)
      const pick = () => members[randomInt(random, 0, members.length - 1)]
      const expenses: Expense[] = Array.from({ length: randomInt(random, 1, 25) }, (_, i) => ({
        id: `e${i}`,
        title: `Expense ${i}`,
        date: '2026-07-14',
        amountCents: randomInt(random, 1, 200_000),
        paidBy: pick(),
        split: randomSplit(random, members),
      }))

      const balances = computeBalances(members, expenses)
      const transfers = settleUp(balances)

      expect(transfers.length).toBeLessThanOrEqual(members.length - 1)
      for (const t of transfers) {
        expect(t.cents).toBeGreaterThan(0)
        expect(t.from).not.toBe(t.to)
      }
      for (const cents of applyTransfers(balances, transfers).values()) {
        expect(cents).toBe(0)
      }
    }
  })
})

function randomSplit(random: () => number, members: string[]): SplitSpec {
  const involved = members.filter(() => random() < 0.7)
  if (involved.length === 0) involved.push(members[0])
  if (random() < 0.6) return { type: 'equal', memberIds: involved }
  const shares = involved.map((memberId) => ({ memberId, weight: randomInt(random, 1, 4) }))
  return { type: 'shares', shares }
}
