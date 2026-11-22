import { assertCents, assertUnique, ExpenseError } from './errors'
import { computeShares } from './split'
import type { Cents, Expense, MemberId, Settlement } from './types'

/**
 * Computes every member's balance.
 *
 * balance = what they paid − their own shares + repayments they made − repayments they received
 *
 * Positive: the member gets money back. Negative: the member owes money.
 * The balances of a group always add up to exactly 0.
 *
 * The returned map keeps the order of `memberIds`.
 */
export function computeBalances(
  memberIds: MemberId[],
  expenses: Expense[],
  settlements: Settlement[] = [],
): Map<MemberId, Cents> {
  assertUnique(memberIds, 'Member list')
  const balances = new Map<MemberId, Cents>(memberIds.map((id) => [id, 0]))

  const add = (memberId: MemberId, cents: Cents, context: string) => {
    const current = balances.get(memberId)
    if (current === undefined) {
      throw new ExpenseError(`${context}: unknown member "${memberId}".`)
    }
    balances.set(memberId, current + cents)
  }

  for (const expense of expenses) {
    if (expense.deletedAt) continue
    const context = `Expense "${expense.title}"`
    add(expense.paidBy, expense.amountCents, context)
    for (const share of computeShares(expense.amountCents, expense.split)) {
      add(share.memberId, -share.cents, context)
    }
  }

  for (const settlement of settlements) {
    assertCents(settlement.amountCents, 'Repayment')
    if (settlement.amountCents <= 0) {
      throw new ExpenseError('A repayment must be greater than 0.')
    }
    if (settlement.from === settlement.to) {
      throw new ExpenseError('A repayment needs two different members.')
    }
    add(settlement.from, settlement.amountCents, 'Repayment')
    add(settlement.to, -settlement.amountCents, 'Repayment')
  }

  return balances
}

/** Sum of all non-deleted expenses. */
export function totalSpent(expenses: Expense[]): Cents {
  return expenses.reduce((sum, e) => (e.deletedAt ? sum : sum + e.amountCents), 0)
}
