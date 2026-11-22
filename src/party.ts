import { useSyncExternalStore } from 'react'

/**
 * Easter egg: tap the "Tripsplit" logo 5 times quickly and the whole UI turns
 * absurdly colourful (styles in party.css, keyed off <html data-party>).
 * Remembered in this browser; 5 more taps end the party.
 */

const STORAGE_KEY = 'tripsplit.party'
export const PARTY_TAPS = 5
export const PARTY_TAP_WINDOW_MS = 2000

interface PartyState {
  on: boolean
  /** When it was last switched on (to replay the confetti), 0 if never in this session. */
  startedAt: number
}

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

let state: PartyState = { on: typeof window !== 'undefined' && readStored(), startedAt: 0 }
const listeners = new Set<() => void>()

function apply() {
  if (typeof document !== 'undefined') document.documentElement.toggleAttribute('data-party', state.on)
}
apply()

export function toggleParty() {
  state = { on: !state.on, startedAt: state.on ? state.startedAt : Date.now() }
  apply()
  try {
    if (state.on) localStorage.setItem(STORAGE_KEY, 'on')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode: the party just won't survive a reload.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useParty(): PartyState {
  return useSyncExternalStore(subscribe, () => state)
}

/**
 * Counts taps; returns true on the tap that completes `needed` taps within
 * `windowMs` (counting from the first of them), then starts over.
 */
export function createTapCounter(needed = PARTY_TAPS, windowMs = PARTY_TAP_WINDOW_MS) {
  let taps: number[] = []
  return (now: number): boolean => {
    taps = taps.filter((t) => now - t < windowMs)
    taps.push(now)
    if (taps.length >= needed) {
      taps = []
      return true
    }
    return false
  }
}
