import { describe, expect, it } from 'vitest'
import { ExpenseError } from './errors'
import { computeShares, splitByWeights, splitEqual, splitExact } from './split'
import { randomInt, seededRandom, sumCents } from './test-utils'

const cents = (shares: { cents: number }[]) => shares.map((s) => s.cents)

describe('splitEqual', () => {
  it('splits €100.00 between 3 people without losing a cent', () => {
    const shares = splitEqual(10000, ['anna', 'ben', 'clara'])
    expect(shares).toEqual([
      { memberId: 'anna', cents: 3334 },
      { memberId: 'ben', cents: 3333 },
      { memberId: 'clara', cents: 3333 },
    ])
  })

  it('splits even amounts exactly', () => {
    expect(cents(splitEqual(9000, ['a', 'b', 'c']))).toEqual([3000, 3000, 3000])
  })

  it('gives leftover cents to the first people in the list', () => {
    expect(cents(splitEqual(1, ['a', 'b', 'c']))).toEqual([1, 0, 0])
    expect(cents(splitEqual(5, ['a', 'b', 'c']))).toEqual([2, 2, 1])
  })

  it('works with a single person', () => {
    expect(splitEqual(4711, ['a'])).toEqual([{ memberId: 'a', cents: 4711 }])
  })
})

describe('splitByWeights', () => {
  it('splits 2:1 correctly', () => {
    expect(cents(splitByWeights(1000, [
      { memberId: 'a', weight: 2 },
      { memberId: 'b', weight: 1 },
    ]))).toEqual([667, 333])
  })

  it('gives leftover cents to the largest remainder, not blindly to the first person', () => {
    // exact: 1.4 / 3.6 cents → b has the larger remainder and gets the extra cent
    expect(cents(splitByWeights(5, [
      { memberId: 'a', weight: 7 },
      { memberId: 'b', weight: 18 },
    ]))).toEqual([1, 4])
  })

  it('gives nothing to people with weight 0', () => {
    expect(cents(splitByWeights(1000, [
      { memberId: 'a', weight: 1 },
      { memberId: 'b', weight: 0 },
      { memberId: 'c', weight: 1 },
    ]))).toEqual([500, 0, 500])
  })

  it('rejects invalid weights', () => {
    expect(() => splitByWeights(1000, [{ memberId: 'a', weight: 1.5 }])).toThrow(ExpenseError)
    expect(() => splitByWeights(1000, [{ memberId: 'a', weight: -1 }])).toThrow(ExpenseError)
    expect(() => splitByWeights(1000, [{ memberId: 'a', weight: 0 }])).toThrow(/greater than 0/)
  })

  it('always adds up exactly for random input, at most 1 cent away from the exact share', () => {
    const random = seededRandom(42)
    for (let run = 0; run < 2000; run++) {
      const total = randomInt(random, 1, 5_000_000)
      const weights = Array.from({ length: randomInt(random, 1, 10) }, (_, i) => ({
        memberId: `m${i}`,
        weight: randomInt(random, 0, 10),
      }))
      if (weights.every((w) => w.weight === 0)) weights[0].weight = 1
      const totalWeight = sumCents(weights.map((w) => w.weight))

      const shares = splitByWeights(total, weights)

      expect(sumCents(cents(shares))).toBe(total)
      shares.forEach((share, i) => {
        const exact = (total * weights[i].weight) / totalWeight
        expect(Math.abs(share.cents - exact)).toBeLessThan(1)
      })
    }
  })
})

describe('splitExact', () => {
  it('accepts amounts that add up', () => {
    expect(splitExact(3000, [
      { memberId: 'a', cents: 1000 },
      { memberId: 'b', cents: 2000 },
    ])).toEqual([
      { memberId: 'a', cents: 1000 },
      { memberId: 'b', cents: 2000 },
    ])
  })

  it('says how much is missing or too much', () => {
    expect(() => splitExact(3000, [{ memberId: 'a', cents: 2500 }])).toThrow('500 cents are still missing.')
    expect(() => splitExact(3000, [{ memberId: 'a', cents: 3200 }])).toThrow('That is 200 cents too much.')
  })

  it('rejects negative or fractional amounts', () => {
    expect(() => splitExact(1000, [
      { memberId: 'a', cents: 1500 },
      { memberId: 'b', cents: -500 },
    ])).toThrow(/negative/)
    expect(() => splitExact(1000, [{ memberId: 'a', cents: 999.5 }])).toThrow(/whole number/)
  })
})

describe('input validation for every split type', () => {
  it('rejects totals ≤ 0 and fractional cents', () => {
    expect(() => splitEqual(0, ['a'])).toThrow(/greater than 0/)
    expect(() => splitEqual(-100, ['a'])).toThrow(/greater than 0/)
    expect(() => splitEqual(12.5, ['a'])).toThrow(/whole number/)
  })

  it('needs at least one person', () => {
    expect(() => splitEqual(1000, [])).toThrow(/At least one member/)
    expect(() => splitExact(1000, [])).toThrow(/At least one member/)
  })

  it('rejects duplicate people', () => {
    expect(() => splitEqual(1000, ['a', 'a'])).toThrow(/listed twice/)
  })
})

describe('computeShares', () => {
  it('picks the matching split type', () => {
    expect(cents(computeShares(1000, { type: 'equal', memberIds: ['a', 'b'] }))).toEqual([500, 500])
    expect(cents(computeShares(900, {
      type: 'shares',
      shares: [{ memberId: 'a', weight: 2 }, { memberId: 'b', weight: 1 }],
    }))).toEqual([600, 300])
    expect(cents(computeShares(900, {
      type: 'exact',
      amounts: [{ memberId: 'a', cents: 100 }, { memberId: 'b', cents: 800 }],
    }))).toEqual([100, 800])
  })
})
