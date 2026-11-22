import { ReceiptText } from 'lucide-react'
import { categoryIcon } from '../categories'
import { describeSplit, formatDay } from '../format'
import { formatCents } from '../lib'
import { stagger } from '../motion'
import type { Expense, Member } from '../lib'
import type { People } from '../people'
import { Card } from './Card'

interface ExpenseListProps {
  /** Only non-deleted expenses. */
  expenses: Expense[]
  members: Member[]
  people: People
  onEdit: (expense: Expense) => void
}

export function ExpenseList({ expenses, members, people, onEdit }: ExpenseListProps) {
  const days = [...new Set(expenses.map((e) => e.date))].sort().reverse()
  // Position of each expense on screen (newest day first), for the staggered entrance.
  const order = new Map(
    days.flatMap((day) => expenses.filter((e) => e.date === day).reverse()).map((e, index) => [e.id, index]),
  )

  return (
    <Card title="Expenses" meta={`${expenses.length} ${expenses.length === 1 ? 'item' : 'items'}`}>
      {expenses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
          <ReceiptText className="size-6 text-ink-muted" strokeWidth={1.75} aria-hidden="true" />
          <p className="font-medium">No expenses yet</p>
          <p className="text-sm text-ink-muted">Add the first one to see who owes whom.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <div key={day}>
              <h3 className="animate-enter text-xs font-medium tracking-[0.14em] text-ink-subtle uppercase">{formatDay(day)}</h3>
              <ul className="mt-1 divide-y divide-line">
                {expenses
                  .filter((e) => e.date === day)
                  .reverse()
                  .map((expense) => {
                    const Icon = categoryIcon(expense.category)
                    return (
                      <li key={expense.id} className="animate-enter" style={stagger(order.get(expense.id) ?? 0, 80)}>
                        <button
                          type="button"
                          onClick={() => onEdit(expense)}
                          className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors duration-150 hover:bg-raised/60 active:bg-raised"
                        >
                          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-raised">
                            <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="sr-only">Edit: </span>
                            <span className="block truncate font-medium">{expense.title}</span>
                            <span className="block text-sm text-ink-muted">
                              {people.name(expense.paidBy)} paid · {describeSplit(expense.split, members, people)}
                            </span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">{formatCents(expense.amountCents)}</span>
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
