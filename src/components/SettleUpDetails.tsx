import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatDay, todayIso } from '../format'
import { applyTransfers, formatCents } from '../lib'
import type { Cents, MemberId, Transfer } from '../lib'
import type { People } from '../people'
import { Avatar } from './Avatar'
import { DialogHeader } from './Dialog'
import { SlideToConfirm } from './SlideToConfirm'

interface SettleUpDetailsProps {
  transfer: Transfer
  /** Balances before this payment. */
  balances: Map<MemberId, Cents>
  people: People
  onConfirm: () => void
  onClose: () => void
}

/** Dialog content: who pays whom, what changes, and a slider to record the payment. */
export function SettleUpDetails({ transfer, balances, people, onConfirm, onClose }: SettleUpDetailsProps) {
  const after = applyTransfers(balances, [transfer])
  const from = people.name(transfer.from)
  const to = people.name(transfer.to)
  const pays = people.verb(transfer.from, 'pays', 'pay')
  const amount = formatCents(transfer.cents)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogHeader title="Settle up" onClose={onClose} />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
        <div className="flex items-start justify-center gap-3">
          <Person label={from} avatarName={people.realName(transfer.from)} caption={pays} />
          <ArrowRight className="mt-5 size-6 shrink-0 text-ink-muted" aria-hidden="true" />
          <Person
            label={to}
            avatarName={people.realName(transfer.to)}
            caption={people.verb(transfer.to, 'receives', 'receive')}
          />
        </div>

        <p className="mt-6 text-center text-5xl font-semibold tracking-[-0.03em] tabular-nums">{amount}</p>
        <p className="mt-2 text-center text-ink-muted">
          {from} {pays} {people.inline(transfer.to)}
        </p>

        <dl className="mt-8 divide-y divide-line rounded-2xl border border-line text-sm">
          <DetailRow label="Date">{formatDay(todayIso())}</DetailRow>
          {[transfer.from, transfer.to].map((id) => (
            <DetailRow key={id} label={people.name(id)}>
              <span className="inline-flex items-center gap-2 whitespace-nowrap text-ink-muted">
                {describeBalance(balances.get(id) ?? 0, people.isMe(id))}
                <ArrowRight className="size-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
              </span>
              <span className="sr-only">afterwards</span>
              <span className="font-semibold whitespace-nowrap">{describeBalance(after.get(id) ?? 0, people.isMe(id))}</span>
            </DetailRow>
          ))}
        </dl>

        <p className="mt-4 text-sm text-ink-muted">
          Only slide once the money has actually been sent. Repayments can be undone later.
        </p>
      </div>

      <div className="border-t border-line px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6">
        <SlideToConfirm label="Slide to settle up" doneLabel="Settled up" onConfirm={onConfirm} />
      </div>
    </div>
  )
}

function Person({ label, avatarName, caption }: { label: string; avatarName: string; caption: string }) {
  return (
    <div className="flex w-24 flex-col items-center gap-2 text-center">
      <Avatar name={avatarName} size="lg" />
      <div>
        <p className="truncate font-semibold">{label}</p>
        <p className="text-xs text-ink-muted">{caption}</p>
      </div>
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-right">{children}</dd>
    </div>
  )
}

function describeBalance(cents: Cents, isMe: boolean): string {
  if (cents > 0) return `${isMe ? 'get' : 'gets'} back ${formatCents(cents)}`
  if (cents < 0) return `${isMe ? 'owe' : 'owes'} ${formatCents(-cents)}`
  return 'settled up'
}
