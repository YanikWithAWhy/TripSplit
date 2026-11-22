import type { Trip } from '../trips'
import type { TripAction } from './actions'

/** Where trips are stored: this browser (local) or Supabase. */
export interface TripBackend {
  kind: 'local' | 'supabase'
  load(): Promise<Trip[]>
  /** Saves one change. `tripsAfter` is the full state after the change, for backends that store everything at once. */
  persist(action: TripAction, tripsAfter: Trip[]): Promise<void>
}
