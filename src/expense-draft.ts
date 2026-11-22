import { computeShares, ExpenseError, formatCents, parseAmount } from './lib'
import type { Cents, Expense, ExpenseCategory, Member, MemberId, SplitSpec } from './lib'

/**
 * Form state for adding or editing an expense, plus the logic that turns it
 * into a valid expense. Kept free of React so it can be unit tested.
 */

export type SplitType = SplitSpec['type']

export interface ExpenseDraft {
  title: string
  /** Raw input, e.g. "12.50" or "12,50". */
  amount: string
  paidBy: MemberId
  /** ISO date, e.g. "2026-07-14". */
  date: string
  category: ExpenseCategory
  splitType: SplitType
  /** Members taking part in an equal split. */
  included: MemberId[]
  /** Integer weights for a split by shares. 0 = not involved. */
  weights: Record<MemberId, number>
  /** Raw amount inputs for an exact split. Empty = 0. */
  exact: Record<MemberId, string>
}

export type DraftField = 'amount' | 'title' | 'paidBy' | 'date' | 'split'
export type DraftErrors = Partial<Record<DraftField, string>>
export type NewExpense = Omit<Expense, 'id'>
export type DraftResult = { ok: true; value: NewExpense } | { ok: false; errors: DraftErrors }

export type ExactStatus =
  | { status: 'no-total' }
  | { status: 'invalid-input' }
  /** Positive: still to assign. Negative: assigned too much. */
  | { status: 'ok'; remaining: Cents }

export const MAX_TITLE_LENGTH = 80
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A blank expense. `payerId` defaults to the first person; the app passes the signed-in user. */
export function emptyDraft(members: Member[], today: string, payerId?: MemberId | null): ExpenseDraft {
  return {
    title: '',
    amount: '',
    paidBy: payerId ?? members[0]?.id ?? '',
    date: today,
    category: 'other',
    splitType: 'equal',
    included: members.map((m) => m.id),
    weights: Object.fromEntries(members.map((m) => [m.id, 1])),
    exact: Object.fromEntries(members.map((m) => [m.id, ''])),
  }
}

export function draftFromExpense(expense: Expense, members: Member[]): ExpenseDraft {
  const draft: ExpenseDraft = {
    ...emptyDraft(members, expense.date),
    title: expense.title,
    amount: centsToInput(expense.amountCents),
    paidBy: expense.paidBy,
    category: expense.category ?? 'other',
    splitType: expense.split.type,
  }

  const { split } = expense
  switch (split.type) {
    case 'equal':
      draft.included = members.map((m) => m.id).filter((id) => split.memberIds.includes(id))
      break
    case 'shares':
      draft.weights = Object.fromEntries(
        members.map((m) => [m.id, split.shares.find((s) => s.memberId === m.id)?.weight ?? 0]),
      )
      break
    case 'exact':
      draft.exact = Object.fromEntries(
        members.map((m) => {
          const cents = split.amounts.find((a) => a.memberId === m.id)?.cents ?? 0
          return [m.id, cents > 0 ? centsToInput(cents) : '']
        }),
      )
      break
  }
  return draft
}

/** 1250 → "12.50" */
export function centsToInput(cents: Cents): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

function exactAmounts(draft: ExpenseDraft, members: Member[]) {
  return members.map((member) => {
    const raw = (draft.exact[member.id] ?? '').trim()
    return { member, cents: raw === '' ? 0 : parseAmount(raw) }
  })
}

/** Turns the draft's split settings into a SplitSpec. Members always keep the group's order. */
export function buildSplit(draft: ExpenseDraft, members: Member[]): SplitSpec {
  switch (draft.splitType) {
    case 'equal':
      return { type: 'equal', memberIds: members.filter((m) => draft.included.includes(m.id)).map((m) => m.id) }
    case 'shares':
      return {
        type: 'shares',
        shares: members
          .map((m) => ({ memberId: m.id, weight: draft.weights[m.id] ?? 0 }))
          .filter((s) => s.weight > 0),
      }
    case 'exact': {
      const amounts = exactAmounts(draft, members)
      const invalid = amounts.find((a) => a.cents === null)
      if (invalid) {
        throw new ExpenseError(`Check the amount for ${invalid.member.name}.`)
      }
      return {
        type: 'exact',
        amounts: amounts.flatMap((a) => (a.cents ? [{ memberId: a.member.id, cents: a.cents }] : [])),
      }
    }
  }
}

/** Validates the whole draft. Returns either a ready-to-save expense or one error per field. */
export function validateDraft(draft: ExpenseDraft, members: Member[]): DraftResult {
  const errors: DraftErrors = {}

  const amountCents = parseAmount(draft.amount)
  if (amountCents === null) {
    errors.amount = draft.amount.trim() === '' ? 'Enter an amount.' : 'Enter an amount like 12.50.'
  } else if (amountCents === 0) {
    errors.amount = 'The amount must be greater than 0.'
  }

  const title = draft.title.trim()
  if (title === '') {
    errors.title = 'Add a short description.'
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Keep it under ${MAX_TITLE_LENGTH} characters.`
  }

  if (!members.some((m) => m.id === draft.paidBy)) {
    errors.paidBy = 'Choose who paid.'
  }

  if (!ISO_DATE.test(draft.date)) {
    errors.date = 'Choose a date.'
  }

  let split: SplitSpec | null = null
  try {
    split = buildSplit(draft, members)
    if ((split.type === 'equal' && split.memberIds.length === 0) || (split.type === 'shares' && split.shares.length === 0)) {
      throw new ExpenseError('Choose at least one person to split with.')
    }
    if (amountCents) {
      if (split.type === 'exact') {
        const assigned = split.amounts.reduce((sum, a) => sum + a.cents, 0)
        if (assigned < amountCents) {
          throw new ExpenseError(`${formatCents(amountCents - assigned)} still has to be assigned.`)
        }
        if (assigned > amountCents) {
          throw new ExpenseError(`That's ${formatCents(assigned - amountCents)} more than the total.`)
        }
      }
      computeShares(amountCents, split)
    }
  } catch (error) {
    if (!(error instanceof ExpenseError)) throw error
    errors.split = error.message
  }

  if (amountCents && split && Object.keys(errors).length === 0) {
    return {
      ok: true,
      value: { title, amountCents, paidBy: draft.paidBy, date: draft.date, category: draft.category, split },
    }
  }
  return { ok: false, errors }
}

/** Each member's share as the form is filled in, or null while the amount or split is incomplete. */
export function previewShares(draft: ExpenseDraft, members: Member[]): Map<MemberId, Cents> | null {
  const amountCents = parseAmount(draft.amount)
  if (!amountCents) return null
  try {
    const shares = computeShares(amountCents, buildSplit(draft, members))
    return new Map(shares.map((s) => [s.memberId, s.cents]))
  } catch {
    return null
  }
}

/** For exact splits: how much of the total is still unassigned. */
export function exactStatus(draft: ExpenseDraft, members: Member[]): ExactStatus {
  const total = parseAmount(draft.amount)
  if (!total) return { status: 'no-total' }
  const amounts = exactAmounts(draft, members)
  if (amounts.some((a) => a.cents === null)) return { status: 'invalid-input' }
  const assigned = amounts.reduce((sum, a) => sum + (a.cents ?? 0), 0)
  return { status: 'ok', remaining: total - assigned }
}
