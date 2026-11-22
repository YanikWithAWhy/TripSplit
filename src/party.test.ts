import { describe, expect, it } from 'vitest'
import { createTapCounter } from './party'

describe('createTapCounter', () => {
  it('triggers on the fifth quick tap', () => {
    const tap = createTapCounter(5, 2000)
    expect([0, 200, 400, 600].map(tap)).toEqual([false, false, false, false])
    expect(tap(800)).toBe(true)
  })

  it('starts over after triggering', () => {
    const tap = createTapCounter(5, 2000)
    ;[0, 100, 200, 300, 400].forEach(tap)
    expect([500, 600, 700, 800].map(tap)).toEqual([false, false, false, false])
    expect(tap(900)).toBe(true)
  })

  it('forgets taps that are too far apart', () => {
    const tap = createTapCounter(5, 2000)
    ;[0, 500, 1000, 1500].forEach(tap)
    // The first tap has expired by now, so this is only the fourth within the window.
    expect(tap(2100)).toBe(false)
    expect(tap(2200)).toBe(true)
  })
})
