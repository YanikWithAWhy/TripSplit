import type { Expense, Member, MemberId, Settlement, SplitSpec, Transfer } from './lib'
import { exampleTrip } from './lib/example-trip'

/**
 * Trips and their members. Pure functions, so every change can be unit tested.
 * Stored in the browser for now, later in Supabase.
 */

export interface Trip {
  id: string
  name: string
  /** Only EUR for now; several currencies come in phase 5. */
  currency: string
  members: Member[]
  expenses: Expense[]
  settlements: Settlement[]
  /** ISO timestamp, used to sort the trip list. */
  createdAt: string
  /** Account that created the trip (its owner). Missing in browser-only mode. */
  createdBy?: string
  /** Open invitations to this trip (only with accounts). */
  invitations?: PendingInvitation[]
}

/** Someone invited by username who hasn't answered yet. */
export interface PendingInvitation {
  id: string
  /** The person in the trip they will become. */
  memberId: MemberId
  userId: string
  username?: string
}

export const MAX_TRIP_NAME_LENGTH = 60
export const MAX_MEMBER_NAME_LENGTH = 30
export const MIN_MEMBERS = 2

export function demoTrip(id: string, now: string, data: Partial<Pick<Trip, 'expenses' | 'settlements'>> = {}): Trip {
  return {
    id,
    name: exampleTrip.name,
    currency: exampleTrip.currency,
    members: exampleTrip.members,
    expenses: data.expenses ?? exampleTrip.expenses,
    settlements: data.settlements ?? [],
    createdAt: now,
  }
}

/**
 * Gives the trip, its members, expenses and repayments new ids, keeping all
 * references intact. Used for the demo trip, whose example ids ("anna") are no UUIDs.
 */
export function remapIds(trip: Trip, newId: () => string): Trip {
  const memberIds = new Map(trip.members.map((m) => [m.id, newId()]))
  const map = (id: MemberId) => memberIds.get(id) ?? id
  const mapSplit = (split: SplitSpec): SplitSpec => {
    switch (split.type) {
      case 'equal':
        return { type: 'equal', memberIds: split.memberIds.map(map) }
      case 'shares':
        return { type: 'shares', shares: split.shares.map((s) => ({ ...s, memberId: map(s.memberId) })) }
      case 'exact':
        return { type: 'exact', amounts: split.amounts.map((a) => ({ ...a, memberId: map(a.memberId) })) }
    }
  }
  return {
    ...trip,
    id: newId(),
    members: trip.members.map((m) => ({ ...m, id: map(m.id) })),
    expenses: trip.expenses.map((e) => ({ ...e, id: newId(), paidBy: map(e.paidBy), split: mapSplit(e.split) })),
    settlements: trip.settlements.map((s) => ({ ...s, id: newId(), from: map(s.from), to: map(s.to) })),
  }
}

/** Makes the first person of a trip "you" (used for the demo trip when signed in). */
export function withMeFirst(trip: Trip, me: Me): Trip {
  const [first, ...rest] = trip.members
  if (!first) return trip
  return { ...trip, members: [{ ...first, name: me.name, userId: me.userId }, ...rest] }
}

/** Which person in the trip is the signed-in user, if any. */
export function findMe(trip: Pick<Trip, 'members'>, userId: string | null | undefined): MemberId | null {
  if (!userId) return null
  return trip.members.find((m) => m.userId === userId)?.id ?? null
}

// ---------------------------------------------------------------------------
// Members

function splitMemberIds(expense: Expense): MemberId[] {
  const { split } = expense
  switch (split.type) {
    case 'equal':
      return split.memberIds
    case 'shares':
      return split.shares.map((s) => s.memberId)
    case 'exact':
      return split.amounts.map((a) => a.memberId)
  }
}

/**
 * How many active expenses and repayments a member is part of.
 * Members in use can't be removed, otherwise the balances would break.
 */
export function memberUsage(trip: Trip, memberId: MemberId): number {
  const expenses = trip.expenses.filter(
    (e) => !e.deletedAt && (e.paidBy === memberId || splitMemberIds(e).includes(memberId)),
  ).length
  const settlements = trip.settlements.filter((s) => s.from === memberId || s.to === memberId).length
  return expenses + settlements
}

// ---------------------------------------------------------------------------
// Trip form (create and edit)

export interface TripDraftMember {
  id: MemberId
  name: string
  /** Added in this form, not saved yet. */
  isNew: boolean
  /** Linked account, e.g. the signed-in user ("you"). */
  userId?: string
}

/** The signed-in user, as the app needs them for trips. */
export interface Me {
  userId: string
  /** Pre-filled as their name in new trips (their username). */
  name: string
}

export interface TripDraft {
  name: string
  members: TripDraftMember[]
}

export interface TripDraftErrors {
  name?: string
  /** Problems with the list as a whole. */
  members?: string
  /** Problems with single names, by member id. */
  memberNames: Record<MemberId, string>
}

/** Two rows for people. When signed in, the first one is you, already filled in. */
export function newTripDraft(newId: () => string, me?: Me | null): TripDraft {
  const members: TripDraftMember[] = Array.from({ length: MIN_MEMBERS }, () => ({ id: newId(), name: '', isNew: true }))
  if (me) members[0] = { ...members[0], name: me.name, userId: me.userId }
  return { name: '', members }
}

export function tripToDraft(trip: Trip): TripDraft {
  return {
    name: trip.name,
    members: trip.members.map((m) => ({
      id: m.id,
      name: m.name,
      isNew: false,
      ...(m.userId ? { userId: m.userId } : {}),
    })),
  }
}

/** Returns null when the draft is valid. Pass the saved trip when editing, to check removed members. */
export function validateTripDraft(draft: TripDraft, trip?: Trip): TripDraftErrors | null {
  const errors: TripDraftErrors = { memberNames: {} }

  const name = draft.name.trim()
  if (name === '') {
    errors.name = 'Give the trip a name.'
  } else if (name.length > MAX_TRIP_NAME_LENGTH) {
    errors.name = `Keep it under ${MAX_TRIP_NAME_LENGTH} characters.`
  }

  const seen = new Set<string>()
  for (const member of draft.members) {
    const memberName = member.name.trim()
    const key = memberName.toLocaleLowerCase()
    if (memberName === '') {
      errors.memberNames[member.id] = 'Enter a name.'
    } else if (memberName.length > MAX_MEMBER_NAME_LENGTH) {
      errors.memberNames[member.id] = `Keep it under ${MAX_MEMBER_NAME_LENGTH} characters.`
    } else if (seen.has(key)) {
      errors.memberNames[member.id] = 'This name is already in the trip.'
    }
    seen.add(key)
  }

  if (draft.members.length < MIN_MEMBERS) {
    errors.members = 'Add at least two people.'
  }

  if (trip) {
    const kept = new Set(draft.members.map((m) => m.id))
    const removed = trip.members.filter((m) => !kept.has(m.id))
    const linked = removed.find((m) => m.userId)
    const used = removed.find((m) => memberUsage(trip, m.id) > 0)
    if (linked) {
      errors.members = `${linked.name} is linked to an account and can't be removed.`
    } else if (used) {
      errors.members = `${used.name} is part of expenses or repayments and can't be removed.`
    }
  }

  const hasErrors = errors.name || errors.members || Object.keys(errors.memberNames).length > 0
  return hasErrors ? errors : null
}

/** Creates a new trip from the draft, or applies it to an existing one (keeping expenses). */
export function applyTripDraft(draft: TripDraft, base: Trip | null, meta: { id: string; now: string }): Trip {
  const name = draft.name.trim()
  const members: Member[] = draft.members.map((m) => ({
    id: m.id,
    name: m.name.trim(),
    ...(m.userId ? { userId: m.userId } : {}),
  }))
  if (base) return { ...base, name, members }
  return { id: meta.id, name, currency: 'EUR', members, expenses: [], settlements: [], createdAt: meta.now }
}

// ---------------------------------------------------------------------------
// Expenses and repayments

export function addExpense(trip: Trip, expense: Expense): Trip {
  return { ...trip, expenses: [...trip.expenses, expense] }
}

export function updateExpense(trip: Trip, id: string, value: Omit<Expense, 'id'>): Trip {
  return { ...trip, expenses: trip.expenses.map((e) => (e.id === id ? { ...value, id } : e)) }
}

/** Soft delete: the expense stays stored but no longer counts. */
export function deleteExpense(trip: Trip, id: string, now: string): Trip {
  return { ...trip, expenses: trip.expenses.map((e) => (e.id === id ? { ...e, deletedAt: now } : e)) }
}

export function addSettlement(trip: Trip, transfer: Transfer, meta: { id: string; now: string }): Trip {
  const settlement: Settlement = {
    id: meta.id,
    from: transfer.from,
    to: transfer.to,
    amountCents: transfer.cents,
    date: meta.now,
  }
  return { ...trip, settlements: [...trip.settlements, settlement] }
}

export function clearSettlements(trip: Trip): Trip {
  return { ...trip, settlements: [] }
}
