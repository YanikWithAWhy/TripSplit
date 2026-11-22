import type { Cents } from './types'

const AMOUNT_PATTERN = /^(\d+)(?:[.,](\d{1,2}))?$/

/**
 * Parses user input like "12", "12.5", "12.50", "12,50" or "€12.50" into cents.
 * Accepts both "." and "," as decimal separator. Returns null for anything
 * else (negative numbers, more than two decimals, thousands separators,
 * letters). Works on the string directly, so there are no floating point errors.
 */
export function parseAmount(input: string): Cents | null {
  const cleaned = input.replace(/[\s€]/g, '')
  const match = AMOUNT_PATTERN.exec(cleaned)
  if (!match) return null

  const units = Number(match[1])
  const cents = Number((match[2] ?? '').padEnd(2, '0'))
  const total = units * 100 + cents
  return Number.isSafeInteger(total) ? total : null
}

/**
 * A balance with its direction: 666 → "+€6.66" (you get money back),
 * -333 → "−€3.33" (you owe), 0 → "€0.00". Uses a real minus sign.
 */
export function formatSignedCents(cents: Cents, currency = 'EUR', locale = 'en-GB'): string {
  const amount = formatCents(Math.abs(cents), currency, locale)
  if (cents > 0) return `+${amount}`
  if (cents < 0) return `−${amount}`
  return amount
}

/** Formats cents for display, e.g. 123456 → "€1,234.56". */
export function formatCents(cents: Cents, currency = 'EUR', locale = 'en-GB'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
}
