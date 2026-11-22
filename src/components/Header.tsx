import { Split } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { createTapCounter, toggleParty } from '../party'
import { homeHref } from '../router'

/** Sticky top bar. `right` holds the account menu or a storage hint. */
export function Header({ right }: { right?: ReactNode }) {
  // Easter egg: 5 quick taps on the logo toggle party mode (see src/party.ts).
  const [countTap] = useState(() => createTapCounter())

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <a
          href={homeHref}
          onClick={(event) => {
            if (countTap(event.timeStamp)) toggleParty()
          }}
          className="flex touch-manipulation items-center gap-2.5 rounded-lg text-lg font-semibold tracking-tight select-none"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-ink text-canvas">
            <Split className="size-5" strokeWidth={2.25} aria-hidden="true" />
          </span>
          Tripsplit
        </a>
        {right}
      </div>
    </header>
  )
}
