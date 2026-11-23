import { demoTrip, remapIds, type Trip } from '../trips'
import { bestEffort, type TripBackend } from './backend'
import { createLocalReceipts } from './local-receipts'

const STORAGE_KEY = 'tripsplit.v2.trips'
/** Keys of the earlier single-trip version, migrated into the demo trip once. */
const LEGACY_EXPENSES_KEY = 'tripsplit.v1.expenses'
const LEGACY_SETTLEMENTS_KEY = 'tripsplit.v1.settlements'

function isTripList(value: unknown): value is Trip[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      const trip = item as Partial<Trip> | null
      return (
        typeof trip?.id === 'string' &&
        Array.isArray(trip.members) &&
        Array.isArray(trip.expenses) &&
        Array.isArray(trip.settlements)
      )
    })
  )
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function save(trips: Trip[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips))
  } catch {
    // Storage full or blocked (private mode): keep working in memory.
  }
}

function firstRun(): Trip[] {
  const now = new Date().toISOString()
  const legacyExpenses = readJson(LEGACY_EXPENSES_KEY)
  if (Array.isArray(legacyExpenses)) {
    const legacySettlements = readJson(LEGACY_SETTLEMENTS_KEY)
    return [
      demoTrip(crypto.randomUUID(), now, {
        expenses: legacyExpenses,
        settlements: Array.isArray(legacySettlements) ? legacySettlements : [],
      }),
    ]
  }
  return [remapIds(demoTrip('', now), () => crypto.randomUUID())]
}

/** Saves all trips in this browser's localStorage. Used when no Supabase project is configured. */
export function createLocalBackend(): TripBackend {
  const receipts = createLocalReceipts()
  return {
    kind: 'local',
    receipts,
    async load() {
      const stored = readJson(STORAGE_KEY)
      if (isTripList(stored)) return stored
      const trips = firstRun()
      save(trips)
      return trips
    },
    async persist(action, tripsAfter) {
      save(tripsAfter)
      // Photos nothing points at anymore.
      if (action.type === 'deleteTrip') await bestEffort(receipts.removeTrip(action.tripId))
      if (action.type === 'saveExpense' && action.replacedReceipt) {
        await bestEffort(receipts.remove([action.replacedReceipt]))
      }
      if (action.type === 'deleteExpense' && action.receiptPath) await bestEffort(receipts.remove([action.receiptPath]))
    },
  }
}
