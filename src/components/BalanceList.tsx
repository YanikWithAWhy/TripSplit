import { formatSignedCents } from '../lib'
import { stagger } from '../motion'
import type { CSSProperties } from 'react'
import type { Cents, Member, MemberId } from '../lib'
import type { People } from '../people'
import { Avatar } from './Avatar'

interface BalanceListProps {
  members: Member[]
  balances: Map<MemberId, Cents>
  people: People
}

export function BalanceList({ members, balances, people }: BalanceListProps) {
  const largest = Math.max(1, ...[...balances.values()].map(Math.abs))

  return (
    <ul className="space-y-4">
      {members.map((member, index) => {
        const cents = balances.get(member.id) ?? 0
        const status =
          cents > 0
            ? people.verb(member.id, 'gets back', 'get back')
            : cents < 0
              ? people.verb(member.id, 'owes', 'owe')
              : 'settled up'
        return (
          <li key={member.id} className="animate-enter" style={stagger(index, 120)}>
            <div className="flex items-center gap-3">
              <Avatar name={member.name} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{people.name(member.id)}</p>
                <p className="text-sm text-ink-muted">{status}</p>
              </div>
              <p className={`font-semibold tabular-nums ${cents === 0 ? 'text-ink-muted' : ''}`}>
                {formatSignedCents(cents)}
              </p>
            </div>
            <BalanceBar cents={cents} ratio={Math.abs(cents) / largest} />
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Diverging bar around a center line: solid white to the right for "gets back",
 * grey to the left for "owes". Decorative, the text above says the same.
 */
function BalanceBar({ cents, ratio }: { cents: Cents; ratio: number }) {
  return (
    <div aria-hidden="true" className="relative mt-3 ml-12 h-1 rounded-full bg-raised">
      <span className="absolute -inset-y-1 left-1/2 w-px bg-line-strong" />
      {cents !== 0 && (
        // Grows out of the center line when it appears (@starting-style), and when the balance changes.
        <span
          className={`absolute inset-y-0 w-1/2 scale-x-(--ratio) transition-[scale] duration-700 ease-out-soft starting:scale-x-0 ${
            cents > 0 ? 'left-1/2 origin-left rounded-r-full bg-ink' : 'right-1/2 origin-right rounded-l-full bg-ink-subtle'
          }`}
          style={{ '--ratio': ratio } as CSSProperties}
        />
      )}
    </div>
  )
}
