import type { Expense, MemberId, Settlement, Transfer } from './lib'
import type { Me, Trip } from './trips'

/**
 * What the signed-in user may do in a trip. Mirrors the database rules in
 * supabase/migrations/…_permissions.sql, so the app only offers what will work.
 * Without an account (browser-only mode) everything is allowed.
 */

/** The author of an expense, or the trip's owner. */
export function canEditExpense(expense: Expense, trip: Trip, me: Me | null): boolean {
  if (!me) return true
  return expense.createdBy === me.userId || trip.createdBy === me.userId
}

/** Only the payer or the receiver can record a repayment. */
export function canSettle(transfer: Transfer, meId: MemberId | null, me: Me | null): boolean {
  if (!me) return true
  return meId !== null && (transfer.from === meId || transfer.to === meId)
}

/** Recorded repayments the user is part of, and may therefore undo. */
export function undoableSettlements(trip: Trip, meId: MemberId | null, me: Me | null): Settlement[] {
  if (!me) return trip.settlements
  if (meId === null) return []
  return trip.settlements.filter((s) => s.from === meId || s.to === meId)
}
