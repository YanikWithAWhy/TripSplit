import { describe, expect, it } from 'vitest'
import { formatCents, formatSignedCents, parseAmount } from './money'

describe('formatSignedCents', () => {
  it('shows the direction of a balance', () => {
    expect(formatSignedCents(666)).toBe('+€6.66')
    expect(formatSignedCents(-333)).toBe('−€3.33')
    expect(formatSignedCents(0)).toBe('€0.00')
  })
})

describe('parseAmount', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['12,50', 1250],
    ['0.05', 5],
    [' €7.05 ', 705],
    ['7,05 €', 705],
    ['0', 0],
  ])('reads "%s" as %i cents', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it.each(['', 'abc', '-5', '12.345', '1,234.56', '.50', '12.', '1e3'])('rejects "%s"', (input) => {
    expect(parseAmount(input)).toBeNull()
  })

  it('has no floating point errors', () => {
    // 0.29 * 100 would be 28.999999999999996 in JavaScript
    expect(parseAmount('0.29')).toBe(29)
    expect(parseAmount('1.15')).toBe(115)
  })
})

describe('formatCents', () => {
  const normalize = (s: string) => s.replace(/\s/g, ' ')

  it('formats in English with the euro sign', () => {
    expect(normalize(formatCents(123456))).toBe('€1,234.56')
    expect(normalize(formatCents(5))).toBe('€0.05')
    expect(normalize(formatCents(-500))).toBe('-€5.00')
  })
})
