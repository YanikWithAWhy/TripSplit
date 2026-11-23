import type { EmailOtpType } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'

/**
 * State around email links that the session alone doesn't tell:
 * - recovering: the user opened a password reset link and still has to pick a new password
 * - linkError: an email link didn't work (expired, used, other browser)
 * - notice: a short message for the sign-in page (e.g. after deleting the account)
 *
 * Kept outside React because supabase-js reports these once, right at startup.
 */
export interface AuthFlowState {
  recovering: boolean
  linkError: string | null
  notice: string | null
}

let state: AuthFlowState = { recovering: false, linkError: null, notice: null }
const listeners = new Set<() => void>()

function update(patch: Partial<AuthFlowState>) {
  const next = { ...state, ...patch }
  if (next.recovering === state.recovering && next.linkError === state.linkError && next.notice === state.notice) return
  state = next
  listeners.forEach((listener) => listener())
}

export const markPasswordRecovery = (recovering: boolean) => update({ recovering })
export const setLinkError = (linkError: string | null) => update({ linkError })
export const setNotice = (notice: string | null) => update({ notice })

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAuthFlow(): AuthFlowState {
  return useSyncExternalStore(subscribe, () => state)
}

export const LINK_FAILED_MESSAGE =
  'This link has expired, was already used, or was opened in a different browser. Please request a new one.'

function replaceUrl(location: Location, history: History, search: URLSearchParams, hash: string) {
  const query = search.toString()
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${hash}`)
}

/**
 * Supabase sends people back with ?error_code=…&error_description=… (or in the
 * hash) when a link is expired or was already used. Reads that once and removes it from the address bar.
 */
export function takeAuthRedirectError(location: Location, history: History): string | null {
  const search = new URLSearchParams(location.search)
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
  const code = search.get('error_code') ?? hash.get('error_code')
  const description = search.get('error_description') ?? hash.get('error_description')
  if (!code && !description) return null

  for (const key of ['error', 'error_code', 'error_description']) search.delete(key)
  replaceUrl(location, history, search, '#/')

  return code === 'otp_expired' ? LINK_FAILED_MESSAGE : (description ?? LINK_FAILED_MESSAGE)
}

const LINK_TYPES: string[] = ['email', 'signup', 'magiclink', 'recovery', 'invite', 'email_change']

/**
 * Links from the customised email templates look like ?token_hash=…&type=… and work
 * on any device (see README). Reads them once and removes them from the address bar.
 */
export function takeTokenHashLink(
  location: Location,
  history: History,
): { tokenHash: string; type: EmailOtpType } | null {
  const search = new URLSearchParams(location.search)
  const tokenHash = search.get('token_hash')
  const type = search.get('type')
  if (!tokenHash || !type || !LINK_TYPES.includes(type)) return null

  search.delete('token_hash')
  search.delete('type')
  replaceUrl(location, history, search, location.hash || '#/')
  return { tokenHash, type }
}

/** Links from the default email templates come back with ?code=… (PKCE, same browser only). */
export function hasAuthCode(location: Location): boolean {
  return new URLSearchParams(location.search).has('code')
}

export function removeAuthCode(location: Location, history: History) {
  const search = new URLSearchParams(location.search)
  if (!search.has('code')) return
  search.delete('code')
  replaceUrl(location, history, search, location.hash || '#/')
}
