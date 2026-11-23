import { Lock } from 'lucide-react'
import { createElement } from 'react'
import { categoryIcon, categoryLabel } from '../categories'
import { describeSplit, formatDay } from '../format'
import { computeShares, formatCents } from '../lib'
import type { Expense, Member, Share } from '../lib'
import type { People } from '../people'
import type { ReceiptStorage } from '../data/receipts'
import { labelText } from '../styles'
import { DialogHeader } from './Dialog'
import { StoredReceipt } from './ReceiptImage'

interface ExpenseDetailsProps {
  expense: Expense
  members: Member[]
  people: People
  receipts: ReceiptStorage
  onClose: () => void
}

/** Read-only view of an expense someone else added. */
export function ExpenseDetails({ expense, members, people, receipts, onClose }: ExpenseDetailsProps) {
  const icon = createElement(categoryIcon(expense.category), {
    className: 'size-5',
    strokeWidth: 1.75,
    'aria-hidden': true,
  })
  let shares: Share[] = []
  try {
    shares = computeShares(expense.amountCents, expense.split).filter((s) => s.cents > 0)
  } catch {
    // Inconsistent split: show the expense without the breakdown.
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogHeader title="Expense" onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-line bg-raised">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{expense.title}</p>
            <p className="text-sm text-ink-muted">
              {formatDay(expense.date)} · {categoryLabel(expense.category)}
            </p>
          </div>
        </div>

        <p className="mt-6 text-4xl font-semibold tracking-[-0.03em] tabular-nums">{formatCents(expense.amountCents)}</p>
        <p className="mt-1 text-ink-muted">
          {people.name(expense.paidBy)} paid · {describeSplit(expense.split, members, people)}
        </p>

        {shares.length > 0 && (
          <dl className="mt-6 divide-y divide-line rounded-2xl border border-line text-sm">
            {shares.map((share) => (
              <div key={share.memberId} className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-ink-muted">{people.name(share.memberId)}</dt>
                <dd className="font-semibold tabular-nums">{formatCents(share.cents)}</dd>
              </div>
            ))}
          </dl>
        )}

        {expense.receiptPath && (
          <div className="mt-6">
            <p className={labelText}>Receipt</p>
            <div className="mt-2">
              <StoredReceipt receipts={receipts} path={expense.receiptPath} label={`Receipt for ${expense.title}`} />
            </div>
          </div>
        )}

        <p className="mt-4 flex items-start gap-2 text-sm text-ink-muted">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Only the person who added this expense, or the trip owner, can change it.
        </p>
      </div>
    </div>
  )
}
