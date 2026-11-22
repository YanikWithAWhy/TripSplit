import { describe, expect, it } from 'vitest'
import { computeBalances, totalSpent } from './balances'
import { exampleTrip } from './example-trip'
import { applyTransfers, settleUp } from './settle'

describe('example trip: a week at Lake Garda', () => {
  const { members, expenses } = exampleTrip
  const memberIds = members.map((m) => m.id)

  it('sums up all expenses', () => {
    expect(totalSpent(expenses)).toBe(80000 + 9550 + 24000 + 6320)
  })

  it('computes the balances of all four', () => {
    expect(Object.fromEntries(computeBalances(memberIds, expenses))).toEqual({
      anna: 49316, // paid €800.00, her share €306.84
      ben: -15133, // paid €95.50, his share €246.83
      clara: -7003, // paid €240.00, her share €310.03
      david: -27180, // paid €63.20, his share €335.00
    })
  })

  it('suggests three payments to Anna, after which everyone is even', () => {
    const balances = computeBalances(memberIds, expenses)
    const transfers = settleUp(balances)
    expect(transfers).toEqual([
      { from: 'david', to: 'anna', cents: 27180 },
      { from: 'ben', to: 'anna', cents: 15133 },
      { from: 'clara', to: 'anna', cents: 7003 },
    ])
    expect([...applyTransfers(balances, transfers).values()].every((c) => c === 0)).toBe(true)
  })
})
