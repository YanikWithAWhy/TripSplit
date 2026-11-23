import type { Expense, Member, Settlement } from '../lib'
import {
  addExpense,
  deleteExpense,
  unsavedInvitationId,
  updateExpense,
  type NewInvite,
  type PendingInvitation,
  type Trip,
} from '../trips'

/**
 * Every change the app can make. The UI dispatches actions; the store applies
 * them to the screen right away (applyAction) and a backend saves them.
 */
export type TripAction =
  /** `invites` are sent right after the trip is saved (accounts only). */
  | { type: 'createTrip'; trip: Trip; invites?: NewInvite[] }
  | {
      type: 'updateTripDetails'
      tripId: string
      name: string
      members: Member[]
      /** Sent after saving. Removed people's invitations are taken back by the database. */
      invites?: NewInvite[]
    }
  | { type: 'deleteTrip'; tripId: string }
  /**
   * Adds the expense, or replaces the one with the same id.
   * `uploadedReceipt`: photo uploaded for this save, removed again if saving fails.
   * `replacedReceipt`: earlier photo the expense no longer uses, removed once saved.
   */
  | { type: 'saveExpense'; tripId: string; expense: Expense; uploadedReceipt?: string; replacedReceipt?: string }
  /** `receiptPath`: the expense's photo, deleted along with it. */
  | { type: 'deleteExpense'; tripId: string; expenseId: string; deletedAt: string; receiptPath?: string }
  | { type: 'addSettlement'; tripId: string; settlement: Settlement }
  /** Undo recorded repayments (only the ones the user may undo). */
  | { type: 'removeSettlements'; tripId: string; settlementIds: string[] }

type TripLevelAction = Exclude<TripAction, { type: 'createTrip' } | { type: 'deleteTrip' }>

export function applyAction(trips: Trip[], action: TripAction): Trip[] {
  switch (action.type) {
    case 'createTrip':
      return [...trips, withInvitations(action.trip, action.invites ?? [])]
    case 'deleteTrip':
      return trips.filter((t) => t.id !== action.tripId)
    default:
      return trips.map((t) => (t.id === action.tripId ? applyToTrip(t, action) : t))
  }
}

function applyToTrip(trip: Trip, action: TripLevelAction): Trip {
  switch (action.type) {
    case 'updateTripDetails':
      return withInvitations({ ...trip, name: action.name, members: action.members }, action.invites ?? [])
    case 'saveExpense': {
      const { expense } = action
      const { id, ...value } = expense
      return trip.expenses.some((e) => e.id === id) ? updateExpense(trip, id, value) : addExpense(trip, expense)
    }
    case 'deleteExpense':
      return deleteExpense(trip, action.expenseId, action.deletedAt)
    case 'addSettlement':
      return { ...trip, settlements: [...trip.settlements, action.settlement] }
    case 'removeSettlements': {
      const ids = new Set(action.settlementIds)
      return { ...trip, settlements: trip.settlements.filter((s) => !ids.has(s.id)) }
    }
  }
}

/**
 * Shows new invitations right away (with a placeholder id until the next reload)
 * and drops those of removed people.
 */
function withInvitations(trip: Trip, invites: NewInvite[]): Trip {
  const memberIds = new Set(trip.members.map((m) => m.id))
  const kept = (trip.invitations ?? []).filter((i) => memberIds.has(i.memberId))
  const added: PendingInvitation[] = invites.map((invite) => ({
    id: unsavedInvitationId(invite.memberId),
    memberId: invite.memberId,
    username: invite.username,
  }))
  const invitations = [...kept, ...added]
  const { invitations: _previous, ...rest } = trip
  return invitations.length > 0 ? { ...rest, invitations } : rest
}
