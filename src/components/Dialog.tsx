import { X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type TransitionEvent } from 'react'
import { iconButton } from '../styles'

/** Matches the close transition of .app-dialog in index.css, plus a little slack. */
const EXIT_FALLBACK_MS = 400

interface DialogProps {
  open: boolean
  onClose: () => void
  /** Accessible name, e.g. "Add expense". */
  label: string
  children: ReactNode
}

/**
 * Modal built on the native <dialog> element, which handles focus trapping,
 * Escape and the inert background. Bottom sheet on phones, centered on larger screens.
 * Slides in when opening and fades out when closing (see .app-dialog in index.css).
 * The element marked with data-autofocus gets focus when it opens.
 */
export function Dialog({ open, onClose, label, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  // The content shown while open. Kept after closing, so it fades out instead of vanishing.
  const [kept, setKept] = useState<ReactNode>(open ? children : null)
  const [closing, setClosing] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)

  // Adjusting state while rendering, when the props change (React's recommended pattern).
  if (open !== wasOpen) {
    setWasOpen(open)
    setClosing(!open)
  }
  if (open && children !== kept) setKept(children)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  // Fallback in case no transitionend arrives (e.g. reduced motion or an older browser).
  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(() => {
      setClosing(false)
      setKept(null)
    }, EXIT_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [closing])

  const finishClosing = (event: TransitionEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== 'opacity' || open) return
    setClosing(false)
    setKept(null)
  }

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={onClose}
      onTransitionEnd={finishClosing}
      className="app-dialog m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl border border-line bg-surface p-0 text-ink shadow-2xl open:flex open:flex-col sm:m-auto sm:max-h-[88dvh] sm:max-w-lg sm:rounded-3xl"
    >
      {open ? children : closing ? kept : null}
    </dialog>
  )
}

/** Title row with a close button, for the top of a dialog. */
export function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 pr-3 pl-5 sm:pl-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <button type="button" onClick={onClose} aria-label="Close" className={iconButton}>
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}
