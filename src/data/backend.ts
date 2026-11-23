import type { Trip } from '../trips'
import type { TripAction } from './actions'
import type { ReceiptStorage } from './receipts'

/** Where trips are stored: this browser (local) or Supabase. */
export interface TripBackend {
  kind: 'local' | 'supabase'
  load(): Promise<Trip[]>
  /** Saves one change. `tripsAfter` is the full state after the change, for backends that store everything at once. */
  persist(action: TripAction, tripsAfter: Trip[]): Promise<void>
  /** Photos of receipts, stored in the same place as the trips. */
  receipts: ReceiptStorage
}

/** For photos nothing points at anymore: if removing one fails, it is merely left behind unseen. */
export const bestEffort = (removal: Promise<void>) => removal.catch(() => undefined)
