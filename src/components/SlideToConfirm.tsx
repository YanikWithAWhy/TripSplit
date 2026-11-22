import { Check, ChevronsRight } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { buttonSecondary } from '../styles'

const KNOB = 56
const INSET = 4
/** Releasing past this share of the track counts as confirmed. */
const COMPLETE_AT = 0.9
const KEYBOARD_STEPS = 5

interface SlideToConfirmProps {
  label: string
  doneLabel: string
  onConfirm: () => void
}

/**
 * "Slide to confirm" control for actions that should not happen by accident.
 *
 * Pointer: drag the knob to the right end. Keyboard: arrow keys / End on the knob.
 * Screen readers: a visually hidden button confirms without sliding.
 */
export function SlideToConfirm({ label, doneLabel, onConfirm }: SlideToConfirmProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startOffset: number } | null>(null)
  const offsetRef = useRef(0)
  const [trackWidth, setTrackWidth] = useState(0)
  const [offset, setOffsetState] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const observer = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width))
    observer.observe(track)
    return () => observer.disconnect()
  }, [])

  const maxOffset = Math.max(0, trackWidth - KNOB - INSET * 2)
  const progress = maxOffset > 0 ? offset / maxOffset : 0
  const percent = Math.round(progress * 100)

  const setOffset = (value: number) => {
    offsetRef.current = value
    setOffsetState(value)
  }

  const complete = () => {
    if (done) return
    setOffset(maxOffset)
    setDone(true)
    onConfirm()
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (done || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startOffset: offsetRef.current }
    setDragging(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setOffset(clamp(drag.startOffset + event.clientX - drag.startX, 0, maxOffset))
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (maxOffset > 0 && offsetRef.current >= maxOffset * COMPLETE_AT) complete()
    else setOffset(0)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (done) return
    const step = maxOffset / KEYBOARD_STEPS
    let next: number
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = offsetRef.current + step
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        next = offsetRef.current - step
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = maxOffset
        break
      default:
        return
    }
    event.preventDefault()
    next = clamp(next, 0, maxOffset)
    if (maxOffset > 0 && next >= maxOffset - 1) complete()
    else setOffset(next)
  }

  const motion = dragging ? '' : 'transition-transform duration-300 ease-out'

  return (
    <div>
      <div
        ref={trackRef}
        className={`relative h-16 overflow-hidden rounded-full border select-none transition-colors duration-300 ${
          done ? 'border-ink bg-ink' : 'border-line-strong bg-raised'
        }`}
      >
        {!done && (
          <div
            aria-hidden="true"
            className={`absolute inset-0 rounded-full bg-ink/10 ${motion}`}
            style={{ transform: `translateX(${offset + KNOB + INSET * 2 - trackWidth}px)` }}
          />
        )}

        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 flex items-center justify-center gap-2 pl-14 text-sm font-semibold ${
            done ? 'text-canvas' : 'text-ink-muted'
          }`}
          style={done ? undefined : { opacity: Math.max(0, 1 - progress * 1.6) }}
        >
          {done ? (
            <>
              <Check className="size-4 animate-pop" strokeWidth={2.5} />
              {doneLabel}
            </>
          ) : (
            <>
              {label}
              <ChevronsRight className="size-4" />
            </>
          )}
        </div>

        <div
          role="slider"
          tabIndex={done ? -1 : 0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={done ? doneLabel : `${percent}%`}
          aria-disabled={done || undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onKeyDown={handleKeyDown}
          className={`absolute top-1 left-1 grid size-14 touch-none place-items-center rounded-full shadow-[0_2px_12px_rgb(0_0_0/0.5)] ${motion} ${
            done ? 'bg-canvas text-ink' : 'cursor-grab bg-ink text-canvas active:cursor-grabbing'
          }`}
          style={{ transform: `translateX(${offset}px)` }}
        >
          {done ? (
            <Check className="size-6 animate-pop" strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <ChevronsRight className="size-6" strokeWidth={2.25} aria-hidden="true" />
          )}
        </div>
      </div>

      {!done && (
        // Hidden until it gets keyboard focus. The wrapper is hidden, not the button:
        // the button's own height would otherwise stick out of the dialog and make it scroll.
        <div className="sr-only focus-within:not-sr-only focus-within:mt-3 focus-within:flex focus-within:justify-center">
          <button type="button" onClick={complete} className={buttonSecondary}>
            Confirm without sliding
          </button>
        </div>
      )}
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
