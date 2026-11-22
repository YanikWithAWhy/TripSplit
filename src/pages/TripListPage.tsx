import { ChevronRight, Luggage, Plus } from 'lucide-react'
import { AvatarStack } from '../components/Avatar'
import { InvitationCard } from '../components/InvitationCard'
import type { IncomingInvitation } from '../data/social'
import { formatDateRange } from '../format'
import { computeBalances, formatCents, formatSignedCents, totalSpent } from '../lib'
import { tripHref } from '../router'
import { stagger } from '../motion'
import { buttonPrimary, buttonSecondary, labelText } from '../styles'
import { findMe, type Trip } from '../trips'

interface TripListPageProps {
  trips: Trip[]
  /** Signed-in user's id, to show their own balance per trip. */
  userId: string | null
  /** Invitations from friends, waiting for an answer. */
  invitations?: IncomingInvitation[]
  onRespond?: (invitation: IncomingInvitation, accept: boolean) => Promise<void>
  onNewTrip: () => void
  onAddDemo: () => void
}

export function TripListPage({ trips, userId, invitations = [], onRespond, onNewTrip, onAddDemo }: TripListPageProps) {
  const sorted = [...trips].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <main className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <div className="flex animate-enter flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">Your trips</h1>
          <p className="mt-2 text-ink-muted">
            {trips.length === 0
              ? 'Track and split shared costs.'
              : `${trips.length} ${trips.length === 1 ? 'trip' : 'trips'}`}
          </p>
        </div>
        {trips.length > 0 && (
          <button type="button" onClick={onNewTrip} className={buttonPrimary}>
            <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
            New trip
          </button>
        )}
      </div>

      {invitations.length > 0 && onRespond && (
        <section aria-labelledby="invitations-heading" className="mt-8">
          <h2 id="invitations-heading" className={`animate-enter ${labelText}`}>
            {invitations.length === 1 ? 'Invitation' : `${invitations.length} invitations`}
          </h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {invitations.map((invitation, index) => (
              <li key={invitation.id} className="animate-enter" style={stagger(index, 40)}>
                <InvitationCard invitation={invitation} onRespond={onRespond} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {trips.length === 0 ? (
        <div className="mt-8 flex animate-enter flex-col items-center gap-3 rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-2xl border border-line bg-raised">
            <Luggage className="size-6" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h2 className="mt-2 text-lg font-semibold">No trips yet</h2>
          <p className="max-w-sm text-sm text-ink-muted">
            Create a trip, add the people who are coming, and keep track of who paid for what.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={onNewTrip} className={buttonPrimary}>
              <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
              New trip
            </button>
            <button type="button" onClick={onAddDemo} className={buttonSecondary}>
              Add demo trip
            </button>
          </div>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {sorted.map((trip, index) => (
            <li key={trip.id} className="animate-enter" style={stagger(index, 60)}>
              <TripCard trip={trip} userId={userId} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function tripStats(trip: Trip, userId: string | null) {
  const visible = trip.expenses.filter((e) => !e.deletedAt)
  const meId = findMe(trip, userId)
  let leftToSettle = 0
  let myBalance: number | null = null
  try {
    const balances = computeBalances(
      trip.members.map((m) => m.id),
      trip.expenses,
      trip.settlements,
    )
    for (const cents of balances.values()) if (cents > 0) leftToSettle += cents
    if (meId) myBalance = balances.get(meId) ?? 0
  } catch {
    // Inconsistent data: the trip page shows the details.
  }
  return {
    count: visible.length,
    total: totalSpent(trip.expenses),
    leftToSettle,
    myBalance,
    dateRange: formatDateRange(visible.map((e) => e.date)),
  }
}

function TripCard({ trip, userId }: { trip: Trip; userId: string | null }) {
  const stats = tripStats(trip, userId)
  const people = `${trip.members.length} ${trip.members.length === 1 ? 'person' : 'people'}`

  return (
    <a
      href={tripHref(trip.id)}
      className="group flex h-full flex-col rounded-3xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-line-strong active:bg-raised/40 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold tracking-tight">{trip.name}</h2>
          <p className="mt-1 text-sm text-ink-muted">{stats.dateRange ?? 'No expenses yet'}</p>
        </div>
        <ChevronRight
          className="mt-1 size-5 shrink-0 text-ink-muted transition-transform duration-150 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <AvatarStack names={trip.members.map((m) => m.name)} />
        <span className="text-sm text-ink-muted">{people}</span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
        <div>
          <dt className="text-ink-muted">Total spent</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">{formatCents(stats.total)}</dd>
        </div>
        {stats.myBalance === null ? (
          <div>
            <dt className="text-ink-muted">Left to settle</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">
              {stats.count > 0 && stats.leftToSettle === 0 ? 'Settled up' : formatCents(stats.leftToSettle)}
            </dd>
          </div>
        ) : (
          <div>
            <dt className="text-ink-muted">
              {stats.myBalance > 0 ? 'You get back' : stats.myBalance < 0 ? 'You owe' : 'Your balance'}
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">
              {stats.myBalance === 0 ? 'Settled up' : formatSignedCents(stats.myBalance)}
            </dd>
          </div>
        )}
      </dl>
    </a>
  )
}
