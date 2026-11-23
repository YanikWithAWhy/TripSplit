import { useMemo, useSyncExternalStore } from 'react'

/**
 * Tiny hash router: "#/" is the trip list, "#/trips/<id>" a single trip,
 * "#/account" the account settings.
 * Hash URLs work on any static host without server configuration.
 */

export type Route =
  | { name: 'trips' }
  | { name: 'trip'; tripId: string }
  | { name: 'account' }

export const homeHref = '#/'
export const tripHref = (tripId: string) => `#/trips/${encodeURIComponent(tripId)}`
export const accountHref = '#/account'

export function parseRoute(hash: string): Route {
  if (hash.replace(/\/$/, '') === accountHref) return { name: 'account' }
  const match = /^#\/trips\/([^/?#]+)\/?$/.exec(hash)
  if (match) {
    try {
      return { name: 'trip', tripId: decodeURIComponent(match[1]) }
    } catch {
      // Malformed escape sequence: fall through to the trip list.
    }
  }
  return { name: 'trips' }
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('hashchange', listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('hashchange', listener)
    window.removeEventListener('popstate', listener)
  }
}

/** Changes the page in code, e.g. after creating a trip. Links can simply use href. */
export function navigate(href: string) {
  if (window.location.hash === href) return
  window.history.pushState(null, '', href)
  listeners.forEach((listener) => listener())
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return useMemo(() => parseRoute(hash), [hash])
}
