import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { NewInvite, Trip } from '../trips'
import type { TripAction } from './actions'
import { bestEffort, type TripBackend } from './backend'
import { createSupabaseReceipts } from './supabase-receipts'
import {
  saveExpenseArgs,
  saveTripArgs,
  settlementInsert,
  accountIds,
  TRIP_SELECT,
  tripFromRow,
  type TripRow,
} from './supabase-mapping'

/** Usernames of fellow travellers and invited friends (the profiles policy allows exactly these). */
async function loadUsernames(client: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await client.from('profiles').select('id, username').in('id', ids)
  if (error) throw new Error(error.message)
  return new Map((data as { id: string; username: string }[]).map((p) => [p.id, p.username]))
}

function check(result: { error: PostgrestError | null }) {
  if (result.error) throw new Error(result.error.message)
}

/** Loads and saves trips in Supabase. Row level security limits everything to the signed-in user's trips. */
export function createSupabaseBackend(client: SupabaseClient): TripBackend {
  const receipts = createSupabaseReceipts(client)

  /** The people exist after save_trip, so each invitation can point at its person. */
  const sendInvites = async (tripId: string, invites: NewInvite[]) => {
    for (const invite of invites) {
      check(
        await client.rpc('invite_to_trip', {
          p_trip_id: tripId,
          p_username: invite.username,
          p_member_id: invite.memberId,
        }),
      )
    }
  }

  const findTrip = (trips: Trip[], id: string) => {
    const trip = trips.find((t) => t.id === id)
    if (!trip) throw new Error('Trip not found.')
    return trip
  }

  return {
    kind: 'supabase',
    receipts,

    async load() {
      const { data, error } = await client.from('trips').select(TRIP_SELECT).order('created_at')
      if (error) throw new Error(error.message)
      const rows = data as unknown as TripRow[]
      const usernames = await loadUsernames(client, accountIds(rows))
      return rows.map((row) => tripFromRow(row, usernames))
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
          await sendInvites(trip.id, action.invites ?? [])
          return
        }
        case 'updateTripDetails': {
          const trip = findTrip(tripsAfter, action.tripId)
          check(await client.rpc('save_trip', saveTripArgs(trip)))
          await sendInvites(trip.id, action.invites ?? [])
          return
        }
        case 'deleteTrip':
          // Photos first: once the trip is gone, nobody may delete them anymore.
          await receipts.removeTrip(action.tripId)
          check(await client.from('trips').delete().eq('id', action.tripId))
          return
        case 'saveExpense': {
          const trip = findTrip(tripsAfter, action.tripId)
          const saved = await client.rpc('save_expense', saveExpenseArgs(trip.id, trip.currency, action.expense))
          if (saved.error && action.uploadedReceipt) await bestEffort(receipts.remove([action.uploadedReceipt]))
          check(saved)
          if (action.replacedReceipt) await bestEffort(receipts.remove([action.replacedReceipt]))
          return
        }
        case 'deleteExpense':
          check(
            await client
              .from('expenses')
              .update({ deleted_at: action.deletedAt, ...(action.receiptPath ? { receipt_path: null } : {}) })
              .eq('id', action.expenseId)
              .eq('trip_id', action.tripId),
          )
          if (action.receiptPath) await bestEffort(receipts.remove([action.receiptPath]))
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
