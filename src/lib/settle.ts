import { assertCents, ExpenseError } from './errors'
import type { Cents, MemberId, Transfer } from './types'

/**
 * Suggests payments that bring every balance to 0.
 *
 * Greedy: the biggest debtor pays the biggest creditor, as much as possible,
 * and so on. Each step settles at least one person, so a group of n people
 * needs at most n − 1 transfers. (The true minimum is an NP-hard problem;
 * this is the standard practical approach.)
 *
 * Ties keep the order of the input map, so the result is deterministic.
 */
export function settleUp(balances: Map<MemberId, Cents>): Transfer[] {
  let sum = 0
  for (const [memberId, cents] of balances) {
    assertCents(cents, `Balance of "${memberId}"`)
    sum += cents
  }
  if (sum !== 0) {
    throw new ExpenseError(`Balances don't add up to 0 (sum: ${sum} cents). The data is inconsistent.`)
  }

  const entries = [...balances]
  const debtors = entries.filter(([, b]) => b < 0).map(([id, b]) => ({ id, amount: -b }))
  const creditors = entries.filter(([, b]) => b > 0).map(([id, b]) => ({ id, amount: b }))
  debtors.sort((a, b) => b.amount - a.amount)
  creditors.sort((a, b) => b.amount - a.amount)

  const transfers: Transfer[] = []
  let d = 0
  let c = 0
  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d]
    const creditor = creditors[c]
    const cents = Math.min(debtor.amount, creditor.amount)
    transfers.push({ from: debtor.id, to: creditor.id, cents })
    debtor.amount -= cents
    creditor.amount -= cents
    if (debtor.amount === 0) d++
    if (creditor.amount === 0) c++
  }

  return transfers
}

/** Applies transfers to balances, e.g. to check that settling up leaves everyone at 0. */
export function applyTransfers(balances: Map<MemberId, Cents>, transfers: Transfer[]): Map<MemberId, Cents> {
  const result = new Map(balances)
  for (const { from, to, cents } of transfers) {
    result.set(from, (result.get(from) ?? 0) + cents)
    result.set(to, (result.get(to) ?? 0) - cents)
  }
  return result
}
