import type { Expense, ExpenseCategory, Settlement, SplitSpec } from '../lib'
import type { Trip } from '../trips'

/**
 * Translation between the app's data and the database rows
 * (see supabase/migrations). Pure functions, covered by tests.
 */

export interface MemberRow {
  id: string
  name: string
  position: number
  user_id: string | null
  deleted_at: string | null
}

export interface SplitRow {
  member_id: string
  position: number
  weight: number | null
  amount_cents: number | null
}

export interface ExpenseRow {
  id: string
  title: string
  amount_cents: number
  paid_by: string
  spent_on: string
  category: string
  split_type: string
  created_at: string
  created_by: string | null
  deleted_at: string | null
  receipt_path: string | null
  expense_splits: SplitRow[]
}

export interface SettlementRow {
  id: string
  from_member: string
  to_member: string
  amount_cents: number
  settled_at: string
}

export interface TripRow {
  id: string
  name: string
  currency: string
  created_at: string
  created_by: string | null
  members: MemberRow[]
  expenses: ExpenseRow[]
  settlements: SettlementRow[]
  trip_invitations?: InvitationRow[]
}

export interface InvitationRow {
  id: string
  member_id: string
  invited_user: string
  status: string
}

/** Select string that loads trips with everything in them (PostgREST embedding). */
export const TRIP_SELECT = [
  'id, name, currency, created_at, created_by',
  'members(id, name, position, user_id, deleted_at)',
  'expenses(id, title, amount_cents, paid_by, spent_on, category, split_type, created_at, created_by, deleted_at,' +
    ' receipt_path,' +
    ' expense_splits(member_id, position, weight, amount_cents))',
  'settlements(id, from_member, to_member, amount_cents, settled_at)',
  'trip_invitations(id, member_id, invited_user, status)',
].join(', ')

const toIso = (timestamp: string) => new Date(timestamp).toISOString()
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

/** Accounts whose usernames the trips show: linked people and invited friends. */
export function accountIds(rows: TripRow[]): string[] {
  const ids = new Set<string>()
  for (const row of rows) {
    for (const m of row.members) if (m.user_id && !m.deleted_at) ids.add(m.user_id)
    for (const i of row.trip_invitations ?? []) if (i.status === 'pending') ids.add(i.invited_user)
  }
  return [...ids]
}

/** `usernames` maps account ids to usernames (see accountIds). */
export function tripFromRow(row: TripRow, usernames: Map<string, string> = new Map()): Trip {
  const invitations = (row.trip_invitations ?? [])
    .filter((i) => i.status === 'pending')
    .map((i) => ({
      id: i.id,
      memberId: i.member_id,
      userId: i.invited_user,
      ...(usernames.has(i.invited_user) ? { username: usernames.get(i.invited_user) } : {}),
    }))
  return {
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(invitations.length > 0 ? { invitations } : {}),
    id: row.id,
    name: row.name,
    currency: row.currency,
    createdAt: toIso(row.created_at),
    members: row.members
      .filter((m) => !m.deleted_at)
      .sort(byPosition)
      .map((m) => {
        if (!m.user_id) return { id: m.id, name: m.name }
        const username = usernames.get(m.user_id)
        return { id: m.id, name: m.name, userId: m.user_id, ...(username ? { username } : {}) }
      }),
    expenses: [...row.expenses]
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .map(expenseFromRow),
    settlements: [...row.settlements]
      .sort((a, b) => Date.parse(a.settled_at) - Date.parse(b.settled_at))
      .map((s) => ({
        id: s.id,
        from: s.from_member,
        to: s.to_member,
        amountCents: s.amount_cents,
        date: toIso(s.settled_at),
      })),
  }
}

function expenseFromRow(row: ExpenseRow): Expense {
  const expense: Expense = {
    id: row.id,
    title: row.title,
    amountCents: row.amount_cents,
    paidBy: row.paid_by,
    date: row.spent_on,
    category: row.category as ExpenseCategory,
    split: splitFromRows(row.split_type, row.expense_splits),
  }
  if (row.created_by) expense.createdBy = row.created_by
  if (row.receipt_path) expense.receiptPath = row.receipt_path
  if (row.deleted_at) expense.deletedAt = toIso(row.deleted_at)
  return expense
}

export function splitFromRows(splitType: string, rows: SplitRow[]): SplitSpec {
  const sorted = [...rows].sort(byPosition)
  switch (splitType) {
    case 'equal':
      return { type: 'equal', memberIds: sorted.map((r) => r.member_id) }
    case 'shares':
      return { type: 'shares', shares: sorted.map((r) => ({ memberId: r.member_id, weight: r.weight ?? 0 })) }
    case 'exact':
      return { type: 'exact', amounts: sorted.map((r) => ({ memberId: r.member_id, cents: r.amount_cents ?? 0 })) }
    default:
      throw new Error(`Unknown split type "${splitType}".`)
  }
}

export type SplitPayload = { member_id: string; weight: number } | { member_id: string; amount_cents: number }

export function splitToPayload(split: SplitSpec): SplitPayload[] {
  switch (split.type) {
    case 'equal':
      return split.memberIds.map((id) => ({ member_id: id, weight: 1 }))
    case 'shares':
      return split.shares.map((s) => ({ member_id: s.memberId, weight: s.weight }))
    case 'exact':
      return split.amounts.map((a) => ({ member_id: a.memberId, amount_cents: a.cents }))
  }
}

/** Arguments for the save_trip database function. */
export function saveTripArgs(trip: Pick<Trip, 'id' | 'name' | 'currency' | 'members'>) {
  return {
    p_trip_id: trip.id,
    p_name: trip.name,
    p_currency: trip.currency,
    // The database only accepts the caller's own user_id and never replaces an existing link.
    p_members: trip.members.map((m) => ({ id: m.id, name: m.name, user_id: m.userId ?? null })),
  }
}

/** Arguments for the save_expense database function. */
export function saveExpenseArgs(tripId: string, currency: string, expense: Expense) {
  return {
    p_expense: {
      id: expense.id,
      trip_id: tripId,
      title: expense.title,
      amount_cents: expense.amountCents,
      currency,
      paid_by: expense.paidBy,
      spent_on: expense.date,
      category: expense.category ?? 'other',
      split_type: expense.split.type,
      receipt_path: expense.receiptPath ?? null,
    },
    p_splits: splitToPayload(expense.split),
  }
}

export function settlementInsert(tripId: string, settlement: Settlement) {
  return {
    id: settlement.id,
    trip_id: tripId,
    from_member: settlement.from,
    to_member: settlement.to,
    amount_cents: settlement.amountCents,
    settled_at: settlement.date,
  }
}
