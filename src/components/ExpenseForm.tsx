import { Minus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { categories } from '../categories'
import type { ReceiptStorage } from '../data/receipts'
import { DialogHeader } from './Dialog'
import { useReceiptDraft } from '../useReceiptDraft'
import { ReceiptField } from './ReceiptField'
import { SegmentPill } from './SegmentPill'
import { FieldError } from './FieldError'
import { exactStatus, MAX_TITLE_LENGTH, previewShares, validateDraft } from '../expense-draft'
import type { DraftErrors, DraftField, ExpenseDraft, NewExpense, SplitType } from '../expense-draft'
import { formatCents } from '../lib'
import type { Cents, Member, MemberId } from '../lib'
import type { People } from '../people'
import { buttonGhost, buttonPrimary, buttonSecondary, iconButton, labelText, textInput } from '../styles'

const MAX_WEIGHT = 99

const splitTypes: { value: SplitType; label: string; hint: string }[] = [
  { value: 'equal', label: 'Equally', hint: 'Everyone selected pays the same.' },
  { value: 'shares', label: 'Shares', hint: '2 shares pay twice as much as 1 share.' },
  { value: 'exact', label: 'Exact', hint: 'Enter what each person pays.' },
]

/** Order in which fields appear, used to focus the first one with an error. */
const fieldOrder: DraftField[] = ['amount', 'title', 'paidBy', 'date', 'split']

/** What happened to the receipt photo while saving. */
export interface ReceiptChange {
  /** New photo uploaded for this save. */
  uploaded?: string
  /** Earlier photo the expense no longer uses. */
  replaced?: string
}

interface ExpenseFormProps {
  mode: 'new' | 'edit'
  members: Member[]
  /** Shows the signed-in user as "You". */
  people?: People
  initialDraft: ExpenseDraft
  /** Where a new receipt photo goes: trip and expense (new expenses get their id up front). */
  tripId: string
  expenseId: string
  receipts: ReceiptStorage
  initialReceiptPath?: string
  onSubmit: (expense: NewExpense, receipt: ReceiptChange) => void
  onCancel: () => void
  /** Only in edit mode. */
  onDelete?: () => void
}

export function ExpenseForm({
  mode,
  members,
  people,
  initialDraft,
  tripId,
  expenseId,
  receipts,
  initialReceiptPath,
  onSubmit,
  onCancel,
  onDelete,
}: ExpenseFormProps) {
  const baseId = useId()
  const [draft, setDraft] = useState(initialDraft)
  const [showErrors, setShowErrors] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const receipt = useReceiptDraft(initialReceiptPath)
  const [uploading, setUploading] = useState(false)
  /** Set when the form closes, so an upload that finishes afterwards doesn't save anything. */
  const closedRef = useRef(false)
  useEffect(() => {
    closedRef.current = false
    return () => {
      closedRef.current = true
    }
  }, [])

  const result = validateDraft(draft, members)
  const errors: DraftErrors = showErrors && !result.ok ? result.errors : {}
  const shares = previewShares(draft, members)
  // Same people, but named for display ("You"). Validation keeps the real names.
  const shown = people ? members.map((m) => ({ ...m, name: people.name(m.id) })) : members

  const fieldId = (field: string) => `${baseId}-${field}`
  const errorId = (field: DraftField) => (errors[field] ? `${baseId}-${field}-error` : undefined)
  const update = (patch: Partial<ExpenseDraft>) => setDraft((d) => ({ ...d, ...patch }))

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (uploading || receipt.preparing) return
    if (!result.ok) {
      setShowErrors(true)
      const first = fieldOrder.find((field) => result.errors[field])
      if (first) document.getElementById(fieldId(first))?.focus()
      return
    }

    const photo = receipt.value
    let uploaded: string | undefined
    if (photo.kind === 'new') {
      setUploading(true)
      receipt.setError(undefined)
      try {
        uploaded = await receipts.upload(tripId, expenseId, photo.image)
      } catch (error) {
        setUploading(false)
        receipt.setError(error instanceof Error ? error.message : "Couldn't upload the photo.")
        document.getElementById(fieldId('receipt'))?.focus()
        return
      }
      if (closedRef.current) {
        // Closed while uploading: nothing gets saved, so the photo isn't needed.
        void receipts.remove([uploaded]).catch(() => undefined)
        return
      }
    }

    const receiptPath = uploaded ?? (photo.kind === 'saved' ? photo.path : undefined)
    const replaced = initialReceiptPath && initialReceiptPath !== receiptPath ? initialReceiptPath : undefined
    onSubmit({ ...result.value, ...(receiptPath ? { receiptPath } : {}) }, { uploaded, replaced })
  }

  const splitHint = splitTypes.find((t) => t.value === draft.splitType)?.hint

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader title={mode === 'new' ? 'Add expense' : 'Edit expense'} onClose={onCancel} />

      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-6 sm:px-6">
        <div>
          <label htmlFor={fieldId('amount')} className={labelText}>
            Amount
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-2xl border border-line bg-raised px-4 transition-colors duration-150 focus-within:border-ink has-aria-invalid:border-ink">
            <span className="text-3xl font-semibold text-ink-muted" aria-hidden="true">
              €
            </span>
            <input
              id={fieldId('amount')}
              data-autofocus
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={draft.amount}
              onChange={(e) => update({ amount: e.target.value })}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errorId('amount')}
              className="h-16 w-full min-w-0 bg-transparent text-3xl font-semibold tracking-tight tabular-nums outline-none placeholder:text-ink-subtle"
            />
          </div>
          <FieldError id={errorId('amount')} message={errors.amount} />
        </div>

        <div>
          <label htmlFor={fieldId('title')} className={labelText}>
            Description
          </label>
          <input
            id={fieldId('title')}
            type="text"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={MAX_TITLE_LENGTH}
            placeholder="e.g. Dinner, taxi, museum tickets"
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errorId('title')}
            className={`mt-2 ${textInput}`}
          />
          <FieldError id={errorId('title')} message={errors.title} />
        </div>

        <fieldset>
          <legend className={labelText}>Category</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map(({ value, label, icon: Icon }) => (
              <Chip
                key={value}
                name={fieldId('category')}
                checked={draft.category === value}
                onChange={() => update({ category: value })}
              >
                <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {label}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset id={fieldId('paidBy')} tabIndex={-1} aria-describedby={errorId('paidBy')} className="outline-none">
          <legend className={labelText}>Paid by</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {shown.map((m) => (
              <Chip
                key={m.id}
                name={fieldId('paid-by')}
                checked={draft.paidBy === m.id}
                onChange={() => update({ paidBy: m.id })}
              >
                {m.name}
              </Chip>
            ))}
          </div>
          <FieldError id={errorId('paidBy')} message={errors.paidBy} />
        </fieldset>

        <div>
          <label htmlFor={fieldId('date')} className={labelText}>
            Date
          </label>
          <input
            id={fieldId('date')}
            type="date"
            value={draft.date}
            onChange={(e) => update({ date: e.target.value })}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errorId('date')}
            className={`mt-2 ${textInput}`}
          />
          <FieldError id={errorId('date')} message={errors.date} />
        </div>

        <fieldset id={fieldId('split')} tabIndex={-1} aria-describedby={errorId('split')} className="outline-none">
          <legend className={labelText}>Split</legend>
          <div className="relative mt-2 grid grid-cols-3 gap-1 rounded-full border border-line bg-raised p-1">
            <SegmentPill index={splitTypes.findIndex((t) => t.value === draft.splitType)} count={splitTypes.length} />
            {splitTypes.map((t) => {
              const selected = draft.splitType === t.value
              return (
                <label key={t.value} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name={fieldId('split-type')}
                    checked={selected}
                    onChange={() => update({ splitType: t.value })}
                    className="peer sr-only"
                  />
                  <span
                    className={`flex h-11 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-300 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                      selected ? 'text-canvas' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {t.label}
                  </span>
                </label>
              )
            })}
          </div>
          <p className="mt-2 text-sm text-ink-muted">{splitHint}</p>

          <div key={draft.splitType} className="mt-3 animate-enter">
            {draft.splitType === 'equal' && (
              <EqualRows
                members={shown}
                included={draft.included}
                shares={shares}
                onChange={(included) => update({ included })}
              />
            )}
            {draft.splitType === 'shares' && (
              <ShareRows
                members={shown}
                weights={draft.weights}
                shares={shares}
                onChange={(weights) => update({ weights })}
              />
            )}
            {draft.splitType === 'exact' && (
              <ExactRows
                baseId={baseId}
                members={shown}
                draft={draft}
                onChange={(exact) => update({ exact })}
              />
            )}
          </div>
          <FieldError id={errorId('split')} message={errors.split} />
        </fieldset>

        <ReceiptField id={fieldId('receipt')} receipts={receipts} draft={receipt} disabled={uploading} />
      </div>

      <div className="flex items-center gap-2 border-t border-line px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6">
        {onDelete &&
          (confirmingDelete ? (
            <button type="button" onClick={onDelete} className={buttonSecondary}>
              <Trash2 className="size-4" aria-hidden="true" />
              Confirm delete
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} className={`-ml-2 ${buttonGhost}`}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </button>
          ))}
        <div className="ml-auto flex gap-2">
          <div className="hidden sm:block">
            <button type="button" onClick={onCancel} className={buttonSecondary}>
              Cancel
            </button>
          </div>
          <button
            type="submit"
            disabled={uploading || receipt.preparing}
            className={`${buttonPrimary} disabled:cursor-wait disabled:opacity-60`}
          >
            {uploading ? 'Uploading photo…' : mode === 'new' ? 'Add expense' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  )
}

interface ChipProps {
  name: string
  checked: boolean
  onChange: () => void
  children: ReactNode
}

/** Radio button that looks like a pill. Selected: white, otherwise outlined. */
function Chip({ name, checked, onChange, children }: ChipProps) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
          checked ? 'border-ink bg-ink text-canvas' : 'border-line text-ink-muted hover:border-ink-subtle hover:text-ink'
        }`}
      >
        {children}
      </span>
    </label>
  )
}

const rowList = 'divide-y divide-line rounded-2xl border border-line'

function ShareAmount({ cents }: { cents: Cents | undefined }) {
  return (
    <span className={`text-sm tabular-nums ${cents === undefined ? 'text-ink-subtle' : 'text-ink-muted'}`}>
      {cents === undefined ? '–' : formatCents(cents)}
    </span>
  )
}

interface EqualRowsProps {
  members: Member[]
  included: MemberId[]
  shares: Map<MemberId, Cents> | null
  onChange: (included: MemberId[]) => void
}

function EqualRows({ members, included, shares, onChange }: EqualRowsProps) {
  const toggle = (id: MemberId) =>
    onChange(members.map((m) => m.id).filter((m) => (m === id ? !included.includes(id) : included.includes(m))))

  return (
    <ul className={rowList}>
      {members.map((m) => {
        const checked = included.includes(m.id)
        return (
          <li key={m.id}>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(m.id)}
                className="size-5 shrink-0 cursor-pointer accent-white"
              />
              <span className={`flex-1 font-medium ${checked ? '' : 'text-ink-muted'}`}>{m.name}</span>
              <ShareAmount cents={checked ? shares?.get(m.id) : undefined} />
            </label>
          </li>
        )
      })}
    </ul>
  )
}

interface ShareRowsProps {
  members: Member[]
  weights: Record<MemberId, number>
  shares: Map<MemberId, Cents> | null
  onChange: (weights: Record<MemberId, number>) => void
}

function ShareRows({ members, weights, shares, onChange }: ShareRowsProps) {
  const set = (id: MemberId, weight: number) =>
    onChange({ ...weights, [id]: Math.min(MAX_WEIGHT, Math.max(0, weight)) })

  return (
    <ul className={rowList}>
      {members.map((m) => {
        const weight = weights[m.id] ?? 0
        return (
          <li key={m.id} className="flex min-h-14 items-center gap-3 py-1.5 pr-2 pl-4">
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${weight > 0 ? '' : 'text-ink-muted'}`}>{m.name}</p>
              <ShareAmount cents={weight > 0 ? shares?.get(m.id) : undefined} />
            </div>
            <button
              type="button"
              onClick={() => set(m.id, weight - 1)}
              disabled={weight === 0}
              aria-label={`Fewer shares for ${m.name}`}
              className={iconButton}
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <output aria-label={`Shares for ${m.name}`} className="w-6 text-center font-semibold tabular-nums">
              {weight}
            </output>
            <button
              type="button"
              onClick={() => set(m.id, weight + 1)}
              disabled={weight >= MAX_WEIGHT}
              aria-label={`More shares for ${m.name}`}
              className={iconButton}
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

interface ExactRowsProps {
  baseId: string
  members: Member[]
  draft: ExpenseDraft
  onChange: (exact: Record<MemberId, string>) => void
}

function ExactRows({ baseId, members, draft, onChange }: ExactRowsProps) {
  const status = exactStatus(draft, members)

  let statusLabel = 'Enter the amount first'
  let statusValue: string | null = null
  if (status.status === 'invalid-input') {
    statusLabel = 'Check the amounts above'
  } else if (status.status === 'ok') {
    statusLabel = status.remaining === 0 ? 'Adds up' : status.remaining > 0 ? 'Left to assign' : 'Too much assigned'
    statusValue = formatCents(Math.abs(status.remaining))
  }

  return (
    <>
      <ul className={rowList}>
        {members.map((m) => {
          const inputId = `${baseId}-exact-${m.id}`
          return (
            <li key={m.id} className="flex min-h-14 items-center gap-3 py-1.5 pr-2 pl-4">
              <label htmlFor={inputId} className="flex-1 font-medium">
                {m.name}
              </label>
              <div className="flex h-11 w-32 items-center gap-1 rounded-xl border border-line bg-canvas px-3 transition-colors duration-150 focus-within:border-ink">
                <span className="text-ink-muted" aria-hidden="true">
                  €
                </span>
                <input
                  id={inputId}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={draft.exact[m.id] ?? ''}
                  onChange={(e) => onChange({ ...draft.exact, [m.id]: e.target.value })}
                  className="w-full min-w-0 bg-transparent text-right text-base tabular-nums outline-none placeholder:text-ink-subtle"
                />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 flex items-center justify-between px-1 text-sm" aria-live="polite">
        <span className="text-ink-muted">{statusLabel}</span>
        {statusValue && <span className="font-semibold tabular-nums">{statusValue}</span>}
      </p>
    </>
  )
}
