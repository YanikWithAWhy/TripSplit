import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../motion'

const DURATION_MS = 550

interface AnimatedAmountProps {
  cents: number
  format: (cents: number) => string
}

/**
 * An amount that counts to its new value when it changes (e.g. after adding an
 * expense or settling up). Screen readers only get the final value.
 */
export function AnimatedAmount({ cents, format }: AnimatedAmountProps) {
  const [shown, setShown] = useState(cents)
  const shownRef = useRef(cents)

  useEffect(() => {
    const from = shownRef.current
    if (from === cents) return
    const duration = prefersReducedMotion() ? 0 : DURATION_MS
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const progress = duration === 0 ? 1 : Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      const value = Math.round(from + (cents - from) * eased)
      shownRef.current = value
      setShown(value)
      if (progress < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [cents])

  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(cents)}</span>
    </>
  )
}
