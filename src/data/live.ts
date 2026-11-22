/** Tables whose changes affect what the trip screens show (see the realtime migration). */
export const LIVE_TABLES = [
  'trips',
  'trip_access',
  'members',
  'expenses',
  'expense_splits',
  'settlements',
  'trip_invitations',
] as const

/** One save touches several tables (e.g. an expense and its splits): wait this long, then reload once. */
export const LIVE_DEBOUNCE_MS = 400

export type LiveStatus = 'connecting' | 'live' | 'offline'

/** Runs `fn` once after `delay` ms without new calls. */
export function debounce(fn: () => void, delay: number): (() => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = () => {
    clearTimeout(timer)
    timer = setTimeout(fn, delay)
  }
  run.cancel = () => clearTimeout(timer)
  return run
}
