import type { Expense, Member, Settlement } from '../lib'
import { addExpense, deleteExpense, updateExpense, type Trip } from '../trips'

/**
 * Every change the app can make. The UI dispatches actions; the store applies
 * them to the screen right away (applyAction) and a backend saves them.
 */
export type TripAction =
  | { type: 'createTrip'; trip: Trip }
  | { type: 'updateTripDetails'; tripId: string; name: string; members: Member[] }
  | { type: 'deleteTrip'; tripId: string }
  /** Adds the expense, or replaces the one with the same id. */
  | { type: 'saveExpense'; tripId: string; expense: Expense }
  | { type: 'deleteExpense'; tripId: string; expenseId: string; deletedAt: string }
  | { type: 'addSettlement'; tripId: string; settlement: Settlement }
  /** Undo recorded repayments (only the ones the user may undo). */
  | { type: 'removeSettlements'; tripId: string; settlementIds: string[] }

type TripLevelAction = Exclude<TripAction, { type: 'createTrip' } | { type: 'deleteTrip' }>

export function applyAction(trips: Trip[], action: TripAction): Trip[] {
  switch (action.type) {
    case 'createTrip':
      return [...trips, action.trip]
    case 'deleteTrip':
      return trips.filter((t) => t.id !== action.tripId)
    default:
      return trips.map((t) => (t.id === action.tripId ? applyToTrip(t, action) : t))
  }
}

function applyToTrip(trip: Trip, action: TripLevelAction): Trip {
  switch (action.type) {
    case 'updateTripDetails':
      return { ...trip, name: action.name, members: action.members }
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
