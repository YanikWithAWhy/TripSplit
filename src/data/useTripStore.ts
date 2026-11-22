import { useCallback, useEffect, useRef, useState } from 'react'
import type { Trip } from '../trips'
import { applyAction, type TripAction } from './actions'
import type { TripBackend } from './backend'

export type LoadState = 'loading' | 'ready' | 'failed'

/**
 * All trips plus a dispatch function. Changes show up immediately and are
 * saved in the background, one after the other. If saving fails, `syncError`
 * is set and `reload` brings back what is actually stored.
 */
export function useTripStore(backend: TripBackend) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [syncError, setSyncError] = useState<string | null>(null)
  const tripsRef = useRef<Trip[]>([])
  const queueRef = useRef<Promise<void>>(Promise.resolve())

  const showLoaded = useCallback((loaded: Trip[]) => {
    tripsRef.current = loaded
    setTrips(loaded)
    setSyncError(null)
    setLoadState('ready')
  }, [])

  const showFailed = useCallback((error: unknown) => {
    setSyncError(messageOf(error))
    setLoadState('failed')
  }, [])

  useEffect(() => {
    let active = true
    backend.load().then(
      (loaded) => active && showLoaded(loaded),
      (error: unknown) => active && showFailed(error),
    )
    return () => {
      active = false
    }
  }, [backend, showLoaded, showFailed])

  /** Throws away unsaved local state and shows what is actually stored. */
  const reload = useCallback(() => {
    setLoadState('loading')
    return backend.load().then(showLoaded, showFailed)
  }, [backend, showLoaded, showFailed])

  const dispatch = useCallback(
    (action: TripAction) => {
      const next = applyAction(tripsRef.current, action)
      tripsRef.current = next
      setTrips(next)
      queueRef.current = queueRef.current
        .then(() => backend.persist(action, next))
        .catch((error: unknown) => setSyncError(messageOf(error)))
    },
    [backend],
  )

  return { trips, loadState, syncError, dispatch, reload }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
