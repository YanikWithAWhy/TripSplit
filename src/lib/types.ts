/**
 * Domain types for the expense logic.
 *
 * All money values are integer cents (e.g. €12.50 = 1250). Never store or
 * compute money as floating point numbers.
 */

export type MemberId = string

export interface Member {
  id: MemberId
  name: string
  /** The account this person belongs to, if any (e.g. the trip's creator). */
  userId?: string
  /** Username of that account, when the app may see it (fellow travellers). */
  username?: string
}

/** Integer amount in the smallest currency unit (cents). */
export type Cents = number

/** How an expense is divided among members. Arrays keep a stable order, which makes rounding deterministic. */
export type SplitSpec =
  /** Everyone listed pays the same amount. */
  | { type: 'equal'; memberIds: MemberId[] }
  /** Split by integer weights, e.g. 2:1. Weight 0 means "not involved". */
  | { type: 'shares'; shares: { memberId: MemberId; weight: number }[] }
  /** Fixed amounts per member. They must add up to the expense total. */
  | { type: 'exact'; amounts: { memberId: MemberId; cents: Cents }[] }

export type ExpenseCategory = 'accommodation' | 'food' | 'transport' | 'groceries' | 'activities' | 'other'

export interface Expense {
  id: string
  title: string
  amountCents: Cents
  paidBy: MemberId
  split: SplitSpec
  category?: ExpenseCategory
  /** Account that added the expense. Only they (or the trip owner) may change it. */
  createdBy?: string
  /** ISO date, e.g. "2026-07-14". */
  date: string
  /** Photo of the receipt, as a path in the receipts storage ("<trip id>/<expense id>/<file>.jpg"). */
  receiptPath?: string
  /** Soft delete: deleted expenses stay stored but no longer count. */
  deletedAt?: string | null
}

/** A repayment between two members ("Ben paid Anna back €20"). */
export interface Settlement {
  id: string
  from: MemberId
  to: MemberId
  amountCents: Cents
  date: string
}

/** One member's part of an expense. */
export interface Share {
  memberId: MemberId
  cents: Cents
}

/** A suggested payment to even out balances. */
export interface Transfer {
  from: MemberId
  to: MemberId
  cents: Cents
}
