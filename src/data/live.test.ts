import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce } from './live'

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs once after a burst of changes', () => {
    const fn = vi.fn()
    const changed = debounce(fn, 400)
    changed()
    vi.advanceTimersByTime(200)
    changed()
    changed()
    vi.advanceTimersByTime(399)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('can be cancelled, e.g. when the page closes', () => {
    const fn = vi.fn()
    const changed = debounce(fn, 400)
    changed()
    changed.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })
})
