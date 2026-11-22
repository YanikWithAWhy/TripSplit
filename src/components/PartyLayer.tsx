import { useEffect, useState, type CSSProperties } from 'react'
import { prefersReducedMotion } from '../motion'
import { useParty } from '../party'

const EMOJIS = ['🎉', '✈️', '🏖️', '🍕', '💸', '🌴', '🍦', '🎈', '🦄', '🌈', '🍹', '🚀', '🪩', '🥳']
const COLORS = ['#ff006e', '#fb5607', '#ffbe0b', '#00f5d4', '#3a86ff', '#8338ec', '#ffffff']
const FLOATERS = 16
const CONFETTI = 90
const CONFETTI_MS = 4500

const random = (min: number, max: number) => min + Math.random() * (max - min)
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]

/** Inline styles plus the custom properties the keyframes read (--drift, --spin). */
type PieceStyle = CSSProperties & Record<`--${string}`, string>

interface Piece {
  id: number
  content: string
  style: PieceStyle
}

function makeFloaters(): Piece[] {
  return Array.from({ length: FLOATERS }, (_, id) => ({
    id,
    content: pick(EMOJIS),
    style: {
      left: `${random(0, 96)}vw`,
      fontSize: `${random(22, 52)}px`,
      animationDuration: `${random(9, 18)}s`,
      // Negative delays: they are already spread over the screen at the start.
      animationDelay: `${-random(0, 18)}s`,
      '--drift': `${random(-15, 15)}vw`,
      '--spin': `${random(-540, 540)}deg`,
    } satisfies PieceStyle,
  }))
}

function makeConfetti(): Piece[] {
  return Array.from({ length: CONFETTI }, (_, id) => {
    const emoji = id % 6 === 0
    return {
      id,
      content: emoji ? pick(EMOJIS) : '',
      style: {
        left: `${random(0, 100)}vw`,
        animationDuration: `${random(2.2, 4)}s`,
        animationDelay: `${random(0, 0.6)}s`,
        '--drift': `${random(-25, 25)}vw`,
        '--spin': `${random(-1080, 1080)}deg`,
        ...(emoji
          ? { fontSize: `${random(20, 34)}px` }
          : {
              width: `${random(6, 12)}px`,
              height: `${random(10, 18)}px`,
              background: pick(COLORS),
              borderRadius: Math.random() < 0.3 ? '999px' : '2px',
            }),
      } satisfies PieceStyle,
    }
  })
}

/** Party mode extras: emojis floating up and a confetti burst when it starts. Purely decorative. */
export function PartyLayer() {
  const { on, startedAt } = useParty()
  const [floaters] = useState(makeFloaters)
  const [burst, setBurst] = useState<{ startedAt: number; pieces: Piece[] } | null>(null)

  // A fresh confetti burst each time the party starts (not when it was already on after a reload).
  if (on && startedAt > 0 && burst?.startedAt !== startedAt) {
    setBurst({ startedAt, pieces: prefersReducedMotion() ? [] : makeConfetti() })
  }

  const burstKey = burst?.startedAt ?? 0
  useEffect(() => {
    if (!burstKey) return
    const timer = window.setTimeout(() => setBurst((b) => (b ? { ...b, pieces: [] } : b)), CONFETTI_MS)
    return () => window.clearTimeout(timer)
  }, [burstKey])

  if (!on) return null

  return (
    <div aria-hidden="true">
      {floaters.map((piece) => (
        <span key={piece.id} className="party-float" style={piece.style}>
          {piece.content}
        </span>
      ))}
      {burst?.pieces.map((piece) => (
        <span key={`${burst.startedAt}-${piece.id}`} className="party-confetti" style={piece.style}>
          {piece.content}
        </span>
      ))}
    </div>
  )
}
