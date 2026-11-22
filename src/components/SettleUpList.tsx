import { ArrowRight, ChevronRight, CircleCheck, RotateCcw } from 'lucide-react'
import { formatCents } from '../lib'
import { stagger } from '../motion'
import type { Transfer } from '../lib'
import type { People } from '../people'
import { buttonPrimary, buttonSecondary } from '../styles'

interface SettleUpListProps {
  transfers: Transfer[]
  people: People
  /** Opens the details for one payment. */
  onSettle: (transfer: Transfer) => void
  /** Only payer and receiver may settle; other payments are shown without a button. */
  canSettle: (transfer: Transfer) => boolean
  /** Signed in, but not linked to a person in this trip yet. */
  needsLink?: boolean
  /** Shown when there are repayments the user may undo. */
  onUndo?: () => void
}

export function SettleUpList({ transfers, people, onSettle, canSettle, needsLink, onUndo }: SettleUpListProps) {
  return (
    <div>
      {transfers.length === 0 ? (
        <p className="flex animate-enter items-center gap-3 rounded-2xl bg-raised p-4 font-medium">
          <CircleCheck className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Everyone is settled up
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {transfers.map((t, index) => {
            const from = people.name(t.from)
            const to = people.name(t.to)
            const pays = people.verb(t.from, 'pays', 'pay')
            const amount = formatCents(t.cents)
            return (
              <li
                key={`${t.from}-${t.to}`}
                className="flex animate-enter items-center gap-3 py-3 first:pt-0 last:pb-0"
                style={stagger(index, 160)}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {from}
                    <ArrowRight className="size-3.5 text-ink-muted" aria-hidden="true" />
                    <span className="sr-only">{pays}</span>
                    {to}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">{amount}</p>
                  {!canSettle(t) && (
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {needsLink
                        ? 'Choose who you are in Edit trip to settle up'
                        : `Only ${from} or ${people.inline(t.to)} can settle this`}
                    </p>
                  )}
                </div>
                {canSettle(t) && (
                  <button
                    type="button"
                    onClick={() => onSettle(t)}
                    aria-label={`Settle: ${from} ${pays} ${people.inline(t.to)} ${amount}`}
                    className={`${buttonPrimary} pr-3.5`}
                  >
                    Settle
                    <ChevronRight className="size-4" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {onUndo && (
        <button type="button" onClick={onUndo} className={`mt-5 ${buttonSecondary}`}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Undo repayments
        </button>
      )}
    </div>
  )
}
