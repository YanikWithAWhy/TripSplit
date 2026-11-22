import { assertCents, assertUnique, ExpenseError } from './errors'
import type { Cents, MemberId, Share, SplitSpec } from './types'

/**
 * Splits a total by integer weights using the largest-remainder method.
 *
 * Every member first gets the rounded-down part of their exact share. The
 * cents left over go one each to the members whose exact share had the
 * largest remainder (ties: earlier in the list first). The result always
 * adds up exactly to the total, and nobody is off by more than one cent.
 *
 * Uses only integer arithmetic, so there are no floating point errors.
 */
export function splitByWeights(
  totalCents: Cents,
  weights: { memberId: MemberId; weight: number }[],
): Share[] {
  assertPositiveTotal(totalCents)
  if (weights.length === 0) {
    throw new ExpenseError('At least one member has to be part of the expense.')
  }
  assertUnique(
    weights.map((w) => w.memberId),
    'Split',
  )
  for (const { memberId, weight } of weights) {
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new ExpenseError(`Share of "${memberId}" must be a whole number ≥ 0 (got: ${weight}).`)
    }
  }

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
  if (totalWeight === 0) {
    throw new ExpenseError('At least one member needs a share greater than 0.')
  }
  if (!Number.isSafeInteger(totalCents * Math.max(...weights.map((w) => w.weight)))) {
    throw new ExpenseError('Amount or shares are too large.')
  }

  const parts = weights.map(({ memberId, weight }, index) => {
    const numerator = totalCents * weight
    return {
      memberId,
      index,
      cents: Math.floor(numerator / totalWeight),
      remainder: numerator % totalWeight,
    }
  })

  let leftover = totalCents - parts.reduce((sum, p) => sum + p.cents, 0)
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const part of byRemainder) {
    if (leftover === 0) break
    part.cents += 1
    leftover -= 1
  }

  return parts.map(({ memberId, cents }) => ({ memberId, cents }))
}

/** Splits a total evenly. €100.00 between 3 people → 33.34 + 33.33 + 33.33. */
export function splitEqual(totalCents: Cents, memberIds: MemberId[]): Share[] {
  return splitByWeights(
    totalCents,
    memberIds.map((memberId) => ({ memberId, weight: 1 })),
  )
}

/** Checks fixed amounts per member and returns them as shares. They must add up to the total. */
export function splitExact(totalCents: Cents, amounts: { memberId: MemberId; cents: Cents }[]): Share[] {
  assertPositiveTotal(totalCents)
  if (amounts.length === 0) {
    throw new ExpenseError('At least one member has to be part of the expense.')
  }
  assertUnique(
    amounts.map((a) => a.memberId),
    'Split',
  )
  for (const { memberId, cents } of amounts) {
    assertCents(cents, `Amount for "${memberId}"`)
    if (cents < 0) {
      throw new ExpenseError(`Amount for "${memberId}" must not be negative.`)
    }
  }

  const sum = amounts.reduce((s, a) => s + a.cents, 0)
  if (sum !== totalCents) {
    const diff = totalCents - sum
    const hint = diff > 0 ? `${diff} cents are still missing.` : `That is ${-diff} cents too much.`
    throw new ExpenseError(`The individual amounts don't add up to the total. ${hint}`)
  }

  return amounts.map(({ memberId, cents }) => ({ memberId, cents }))
}

/** Computes each member's share for any kind of split. */
export function computeShares(totalCents: Cents, split: SplitSpec): Share[] {
  switch (split.type) {
    case 'equal':
      return splitEqual(totalCents, split.memberIds)
    case 'shares':
      return splitByWeights(totalCents, split.shares)
    case 'exact':
      return splitExact(totalCents, split.amounts)
  }
}

function assertPositiveTotal(totalCents: Cents): void {
  assertCents(totalCents, 'Total')
  if (totalCents <= 0) {
    throw new ExpenseError('The total must be greater than 0.')
  }
}
