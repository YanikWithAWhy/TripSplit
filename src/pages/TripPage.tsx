import { ChevronLeft, CircleAlert, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AvatarStack } from '../components/Avatar'
import { AnimatedAmount } from '../components/AnimatedAmount'
import { BalanceList } from '../components/BalanceList'
import { Card } from '../components/Card'
import { Dialog } from '../components/Dialog'
import { ExpenseDetails } from '../components/ExpenseDetails'
import { ExpenseForm } from '../components/ExpenseForm'
import { ExpenseList } from '../components/ExpenseList'
import { SettleUpDetails } from '../components/SettleUpDetails'
import { SettleUpList } from '../components/SettleUpList'
import { TripForm } from '../components/TripForm'
import { draftFromExpense, emptyDraft, type NewExpense } from '../expense-draft'
import { formatDateRange, todayIso } from '../format'
import { computeBalances, formatCents, formatSignedCents, settleUp, totalSpent } from '../lib'
import type { Cents, Expense, MemberId, Transfer } from '../lib'
import type { TripAction } from '../data/actions'
import type { ReceiptStorage } from '../data/receipts'
import { useSocial } from '../data/social'
import type { ReceiptChange } from '../components/ExpenseForm'
import { createPeople } from '../people'
import { stagger } from '../motion'
import { canEditExpense, canSettle, undoableSettlements } from '../permissions'
import { homeHref, navigate } from '../router'
import { buttonGhost, buttonPrimary, buttonSecondary } from '../styles'
import { applyTripDraft, draftInvites, findMe, type Me, type Trip, type TripDraft } from '../trips'

interface TripPageProps {
  trip: Trip
  dispatch: (action: TripAction) => void
  /** The signed-in user, or null in browser-only mode. */
  me: Me | null
  /** Reload trips after changes made outside the store (invitations, leaving). */
  onRemoteChange: () => void
  /** Receipt photos (Supabase Storage or this browser). */
  receipts: ReceiptStorage
}

/**
 * new/edit: the form. view: read-only, for expenses the user may not change.
 * New expenses get their id when the form opens, so a receipt photo can be uploaded for them.
 */
type ExpenseEditor =
  | { mode: 'new'; id: string }
  | { mode: 'edit'; expense: Expense }
  | { mode: 'view'; expense: Expense }
/** The payment being settled, with the balances from when the dialog opened. */
type Settling = { transfer: Transfer; balances: Map<MemberId, Cents> }

/** How long the "Settled up" state stays visible before the dialog closes. */
const SETTLED_DELAY_MS = 700

export function TripPage({ trip, dispatch, me, onRemoteChange, receipts }: TripPageProps) {
  const social = useSocial()
  const [pageError, setPageError] = useState<string | null>(null)
  const { members } = trip
  const [expenseEditor, setExpenseEditor] = useState<ExpenseEditor | null>(null)
  const [settling, setSettling] = useState<Settling | null>(null)
  const [editingTrip, setEditingTrip] = useState(false)

  const meId = findMe(trip, me?.userId)
  const people = useMemo(() => createPeople(members, meId), [members, meId])

  const visible = useMemo(() => trip.expenses.filter((e) => !e.deletedAt), [trip.expenses])
  const balances = useMemo(
    () =>
      computeBalances(
        members.map((m) => m.id),
        trip.expenses,
        trip.settlements,
      ),
    [members, trip.expenses, trip.settlements],
  )
  const transfers = useMemo(() => settleUp(balances), [balances])

  const total = totalSpent(trip.expenses)
  const perPerson = Math.round(total / Math.max(1, members.length))
  const leftToSettle = [...balances.values()].reduce((sum, c) => (c > 0 ? sum + c : sum), 0)
  const myBalance = meId ? (balances.get(meId) ?? 0) : null
  const undoable = undoableSettlements(trip, meId, me)
  /** Signed in, but not linked to any person in this trip yet. */
  const needsLink = Boolean(me && !meId)
  const dateRange = formatDateRange(visible.map((e) => e.date))
  const now = () => new Date().toISOString()

  const startNewExpense = () => setExpenseEditor({ mode: 'new', id: crypto.randomUUID() })

  const saveExpense = (value: NewExpense, receipt: ReceiptChange) => {
    if (!expenseEditor || expenseEditor.mode === 'view') return
    const existing = expenseEditor.mode === 'edit' ? expenseEditor.expense : null
    const id = existing?.id ?? (expenseEditor.mode === 'new' ? expenseEditor.id : crypto.randomUUID())
    // The author stays the same when editing; new expenses belong to the signed-in user.
    const createdBy = existing ? existing.createdBy : me?.userId
    dispatch({
      type: 'saveExpense',
      tripId: trip.id,
      expense: { ...value, id, ...(createdBy ? { createdBy } : {}) },
      ...(receipt.uploaded ? { uploadedReceipt: receipt.uploaded } : {}),
      ...(receipt.replaced ? { replacedReceipt: receipt.replaced } : {}),
    })
    setExpenseEditor(null)
  }

  const openExpense = (expense: Expense) =>
    setExpenseEditor(canEditExpense(expense, trip, me) ? { mode: 'edit', expense } : { mode: 'view', expense })

  const removeExpense = () => {
    if (expenseEditor?.mode !== 'edit') return
    const { id, receiptPath } = expenseEditor.expense
    dispatch({ type: 'deleteExpense', tripId: trip.id, expenseId: id, deletedAt: now(), ...(receiptPath ? { receiptPath } : {}) })
    setExpenseEditor(null)
  }

  const confirmSettle = () => {
    if (!settling) return
    const current = settling
    const { from, to, cents } = current.transfer
    dispatch({
      type: 'addSettlement',
      tripId: trip.id,
      settlement: { id: crypto.randomUUID(), from, to, amountCents: cents, date: now() },
    })
    window.setTimeout(() => setSettling((s) => (s === current ? null : s)), SETTLED_DELAY_MS)
  }

  const saveTrip = (draft: TripDraft) => {
    const { name, members: updatedMembers } = applyTripDraft(draft, trip, { id: trip.id, now: trip.createdAt })
    const invites = draftInvites(draft)
    dispatch({ type: 'updateTripDetails', tripId: trip.id, name, members: updatedMembers, invites })
    setEditingTrip(false)
    // Load the real invitations (and removed people's withdrawn ones) once saved.
    if (invites.length > 0 || trip.invitations?.length) onRemoteChange()
  }

  const deleteTrip = () => {
    navigate(homeHref)
    dispatch({ type: 'deleteTrip', tripId: trip.id })
  }

  // Only the owner deletes a trip; invited friends can leave it instead.
  const isOwner = !me || trip.createdBy === me.userId
  const leaveTrip = async () => {
    if (!social) return
    setEditingTrip(false)
    try {
      await social.leaveTrip(trip.id)
      navigate(homeHref)
      onRemoteChange()
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  return (
    <>
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-32 sm:px-6 sm:pt-6 sm:pb-16">
        <a href={homeHref} className={`-ml-3 ${buttonGhost}`}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          All trips
        </a>

        <section className="mt-4 flex animate-enter flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-[0.14em] text-ink-subtle uppercase">Trip</p>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.02em] break-words sm:text-4xl">{trip.name}</h1>
            <p className="mt-2 text-ink-muted">
              {dateRange && `${dateRange} · `}
              {members.length} {members.length === 1 ? 'person' : 'people'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setEditingTrip(true)} className={`${buttonSecondary} pl-1.5`}>
              <AvatarStack names={members.map((m) => m.name)} />
              Edit trip
            </button>
            <div className="hidden sm:block">
              <button type="button" onClick={startNewExpense} className={buttonPrimary}>
                <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
                Add expense
              </button>
            </div>
          </div>
        </section>

        {pageError && (
          <p role="alert" className="mt-6 flex animate-enter items-start gap-2 rounded-2xl border border-ink p-3 text-sm font-medium">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {pageError}
          </p>
        )}

        {needsLink && (
          <div
            className="mt-6 flex animate-enter flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong p-4"
            style={stagger(1)}
          >
            <p className="text-sm">
              <span className="font-semibold">Which one is you?</span>{' '}
              <span className="text-ink-muted">Link yourself to a person in this trip to see your balance and settle up.</span>
            </p>
            <button type="button" onClick={() => setEditingTrip(true)} className={buttonSecondary}>
              Choose
            </button>
          </div>
        )}

        <section aria-label="Summary" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="animate-enter rounded-3xl bg-ink p-5 text-canvas sm:p-6" style={stagger(1)}>
            <p className="text-xs font-semibold tracking-[0.14em] text-canvas/65 uppercase">Total spent</p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] tabular-nums sm:text-5xl">
              <AnimatedAmount cents={total} format={formatCents} />
            </p>
            <dl className="mt-6 flex gap-8 text-sm">
              <div>
                <dt className="text-canvas/65">Avg. per person</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  <AnimatedAmount cents={perPerson} format={formatCents} />
                </dd>
              </div>
              <div>
                <dt className="text-canvas/65">Expenses</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{visible.length}</dd>
              </div>
            </dl>
          </div>

          <div
            aria-live="polite"
            className="flex animate-enter flex-col rounded-3xl border border-line bg-surface p-5 sm:p-6"
            style={stagger(2)}
          >
            {myBalance === null ? (
              <>
                <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Left to settle</p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] tabular-nums sm:text-5xl">
                  <AnimatedAmount cents={leftToSettle} format={formatCents} />
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
                  {myBalance > 0 ? 'You get back' : myBalance < 0 ? 'You owe' : 'Your balance'}
                </p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] tabular-nums sm:text-5xl">
                  {myBalance === 0 ? 'Settled up' : <AnimatedAmount cents={myBalance} format={formatSignedCents} />}
                </p>
              </>
            )}
            <p className="mt-auto pt-6 text-sm text-ink-muted">
              {transfers.length === 0
                ? 'Everyone is settled up'
                : myBalance === null
                  ? `${transfers.length} ${transfers.length === 1 ? 'payment' : 'payments'} to even out`
                  : `${formatCents(leftToSettle)} left to settle in this trip`}
            </p>
          </div>
        </section>

        <div className="mt-4 grid animate-enter grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]" style={stagger(3)}>
          <ExpenseList
            expenses={visible}
            members={members}
            people={people}
            onEdit={openExpense}
          />

          <div className="grid grid-cols-1 gap-4 lg:sticky lg:top-20">
            <Card title="Balances">
              <BalanceList members={members} balances={balances} people={people} />
            </Card>
            <Card title="Settle up">
              <SettleUpList
                transfers={transfers}
                people={people}
                onSettle={(transfer) => setSettling({ transfer, balances })}
                canSettle={(transfer) => canSettle(transfer, meId, me)}
                needsLink={needsLink}
                onUndo={
                  undoable.length > 0
                    ? () =>
                        dispatch({
                          type: 'removeSettlements',
                          tripId: trip.id,
                          settlementIds: undoable.map((s) => s.id),
                        })
                    : undefined
                }
              />
            </Card>
          </div>
        </div>
      </main>

      <button
        type="button"
        onClick={startNewExpense}
        style={stagger(6)}
        className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 inline-flex h-14 animate-enter items-center gap-2 rounded-full bg-ink px-6 font-semibold text-canvas shadow-[0_8px_32px_rgb(0_0_0/0.7)] transition-[background-color,scale] duration-150 hover:bg-ink/85 active:scale-[0.97] active:bg-ink/70 sm:hidden"
      >
        <Plus className="size-5" strokeWidth={2.5} aria-hidden="true" />
        Add expense
      </button>

      <Dialog
        open={expenseEditor !== null}
        onClose={() => setExpenseEditor(null)}
        label={
          expenseEditor?.mode === 'edit' ? 'Edit expense' : expenseEditor?.mode === 'view' ? 'Expense' : 'Add expense'
        }
      >
        {expenseEditor?.mode === 'view' && (
          <ExpenseDetails
            expense={expenseEditor.expense}
            members={members}
            people={people}
            receipts={receipts}
            onClose={() => setExpenseEditor(null)}
          />
        )}
        {expenseEditor && expenseEditor.mode !== 'view' && (
          <ExpenseForm
            key={expenseEditor.mode === 'edit' ? expenseEditor.expense.id : expenseEditor.id}
            mode={expenseEditor.mode}
            members={members}
            people={people}
            initialDraft={
              expenseEditor.mode === 'edit'
                ? draftFromExpense(expenseEditor.expense, members)
                : emptyDraft(members, todayIso(), meId)
            }
            tripId={trip.id}
            expenseId={expenseEditor.mode === 'edit' ? expenseEditor.expense.id : expenseEditor.id}
            receipts={receipts}
            initialReceiptPath={expenseEditor.mode === 'edit' ? expenseEditor.expense.receiptPath : undefined}
            onSubmit={saveExpense}
            onCancel={() => setExpenseEditor(null)}
            onDelete={expenseEditor.mode === 'edit' ? removeExpense : undefined}
          />
        )}
      </Dialog>

      <Dialog open={settling !== null} onClose={() => setSettling(null)} label="Settle up">
        {settling && (
          <SettleUpDetails
            transfer={settling.transfer}
            balances={settling.balances}
            people={people}
            onConfirm={confirmSettle}
            onClose={() => setSettling(null)}
          />
        )}
      </Dialog>

      <Dialog open={editingTrip} onClose={() => setEditingTrip(false)} label="Trip settings">
        <TripForm
          trip={trip}
          me={me}
          onSubmit={saveTrip}
          onCancel={() => setEditingTrip(false)}
          onDelete={isOwner ? deleteTrip : undefined}
          onLeave={!isOwner && social ? () => void leaveTrip() : undefined}
        />
      </Dialog>
    </>
  )
}
