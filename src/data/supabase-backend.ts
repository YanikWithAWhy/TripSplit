import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Trip } from '../trips'
import type { TripAction } from './actions'
import type { TripBackend } from './backend'
import {
  saveExpenseArgs,
  saveTripArgs,
  settlementInsert,
  TRIP_SELECT,
  tripFromRow,
  type TripRow,
} from './supabase-mapping'

function check(result: { error: PostgrestError | null }) {
  if (result.error) throw new Error(result.error.message)
}

/** Loads and saves trips in Supabase. Row level security limits everything to the signed-in user's trips. */
export function createSupabaseBackend(client: SupabaseClient): TripBackend {
  const findTrip = (trips: Trip[], id: string) => {
    const trip = trips.find((t) => t.id === id)
    if (!trip) throw new Error('Trip not found.')
    return trip
  }

  return {
    kind: 'supabase',

    async load() {
      const { data, error } = await client.from('trips').select(TRIP_SELECT).order('created_at')
      if (error) throw new Error(error.message)
      return (data as unknown as TripRow[]).map(tripFromRow)
    },

    async persist(action: TripAction, tripsAfter: Trip[]) {
      switch (action.type) {
        case 'createTrip': {
          const { trip } = action
          check(await client.rpc('save_trip', saveTripArgs(trip)))
          // Only the demo trip arrives with expenses and repayments.
          for (const expense of trip.expenses) {
            check(await client.rpc('save_expense', saveExpenseArgs(trip.id, trip.currency, expense)))
          }
          if (trip.settlements.length > 0) {
            check(await client.from('settlements').insert(trip.settlements.map((s) => settlementInsert(trip.id, s))))
          }
          return
        }
        case 'updateTripDetails': {
          const trip = findTrip(tripsAfter, action.tripId)
          check(await client.rpc('save_trip', saveTripArgs(trip)))
          return
        }
        case 'deleteTrip':
          check(await client.from('trips').delete().eq('id', action.tripId))
          return
        case 'saveExpense': {
          const trip = findTrip(tripsAfter, action.tripId)
          check(await client.rpc('save_expense', saveExpenseArgs(trip.id, trip.currency, action.expense)))
          return
        }
        case 'deleteExpense':
          check(
            await client
              .from('expenses')
              .update({ deleted_at: action.deletedAt })
              .eq('id', action.expenseId)
              .eq('trip_id', action.tripId),
          )
          return
        case 'addSettlement':
          check(await client.from('settlements').insert(settlementInsert(action.tripId, action.settlement)))
          return
        case 'removeSettlements':
          if (action.settlementIds.length === 0) return
          check(
            await client.from('settlements').delete().eq('trip_id', action.tripId).in('id', action.settlementIds),
          )
          return
      }
    },
  }
}
