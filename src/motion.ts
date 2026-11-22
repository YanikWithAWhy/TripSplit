import type { CSSProperties } from 'react'

/** Delay between list items appearing one after another. */
const STAGGER_MS = 35
/** Items further down the list don't wait any longer than this many steps. */
const MAX_STEPS = 10

/**
 * Style for the nth item of a list with class "animate-enter", so the items
 * appear one after another. `offset` shifts the whole list, e.g. below a header.
 */
export function stagger(index: number, offset = 0): CSSProperties {
  return { animationDelay: `${offset + Math.min(index, MAX_STEPS) * STAGGER_MS}ms` }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
