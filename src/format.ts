import type { Member, SplitSpec } from './lib'
import type { People } from './people'

const LOCALE = 'en-GB'

const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
const rangeFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
const listFormat = new Intl.ListFormat(LOCALE, { type: 'conjunction' })

/** Parses "2026-07-14" as a local date (not UTC), so the day never shifts by time zone. */
export function parseDay(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Today's local date as "2026-07-14". */
export function todayIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** "2026-07-11" → "Sat 11 Jul" */
export function formatDay(iso: string): string {
  return dayFormat.format(parseDay(iso))
}

/** ["2026-07-11", "2026-07-14"] → "11–14 Jul 2026" */
export function formatDateRange(isoDates: string[]): string | null {
  if (isoDates.length === 0) return null
  const sorted = [...isoDates].sort()
  return rangeFormat.formatRange(parseDay(sorted[0]), parseDay(sorted[sorted.length - 1]))
}

/** Short, human description of how an expense is split, e.g. "Split between you and Ben". */
export function describeSplit(split: SplitSpec, members: Member[], people: People): string {
  switch (split.type) {
    case 'equal':
      if (split.memberIds.length === members.length) return 'Split equally'
      if (split.memberIds.length === 1) return `For ${people.inline(split.memberIds[0])}`
      return `Split between ${listFormat.format(split.memberIds.map(people.inline))}`
    case 'shares':
      return `By shares: ${split.shares.map((s) => `${people.inline(s.memberId)} ${s.weight}`).join(', ')}`
    case 'exact':
      return 'Exact amounts'
  }
}
