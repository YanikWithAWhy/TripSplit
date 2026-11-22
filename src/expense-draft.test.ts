import { describe, expect, it } from 'vitest'
import {
  centsToInput,
  draftFromExpense,
  emptyDraft,
  exactStatus,
  previewShares,
  validateDraft,
  type ExpenseDraft,
} from './expense-draft'
import { exampleTrip } from './lib/example-trip'

const members = [
  { id: 'anna', name: 'Anna' },
  { id: 'ben', name: 'Ben' },
  { id: 'clara', name: 'Clara' },
]
const today = '2026-07-14'
const draft = (patch: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  ...emptyDraft(members, today),
  title: 'Dinner',
  amount: '90',
  ...patch,
})

function errorsOf(d: ExpenseDraft) {
  const result = validateDraft(d, members)
  return result.ok ? {} : result.errors
}

describe('emptyDraft', () => {
  it('starts with everyone included, the first member as payer and today as date', () => {
    expect(emptyDraft(members, today)).toEqual({
      title: '',
      amount: '',
      paidBy: 'anna',
      date: today,
      category: 'other',
      splitType: 'equal',
      included: ['anna', 'ben', 'clara'],
      weights: { anna: 1, ben: 1, clara: 1 },
      exact: { anna: '', ben: '', clara: '' },
    })
  })
})

describe('validateDraft', () => {
  it('builds an expense split equally between everyone', () => {
    expect(validateDraft(draft({ title: '  Dinner  ' }), members)).toEqual({
      ok: true,
      value: {
        title: 'Dinner',
        amountCents: 9000,
        paidBy: 'anna',
        date: today,
        category: 'other',
        split: { type: 'equal', memberIds: ['anna', 'ben', 'clara'] },
      },
    })
  })

  it('reports every missing field at once', () => {
    expect(errorsOf(emptyDraft(members, ''))).toEqual({
      amount: 'Enter an amount.',
      title: 'Add a short description.',
      date: 'Choose a date.',
    })
  })

  it('explains invalid amounts', () => {
    expect(errorsOf(draft({ amount: 'abc' })).amount).toBe('Enter an amount like 12.50.')
    expect(errorsOf(draft({ amount: '0' })).amount).toBe('The amount must be greater than 0.')
  })

  it('limits the description length', () => {
    expect(errorsOf(draft({ title: 'x'.repeat(81) })).title).toMatch(/under 80/)
  })

  it('needs a payer from the group', () => {
    expect(errorsOf(draft({ paidBy: 'zoe' })).paidBy).toBe('Choose who paid.')
  })

  it('needs at least one person in the split', () => {
    expect(errorsOf(draft({ included: [] })).split).toBe('Choose at least one person to split with.')
    expect(errorsOf(draft({ splitType: 'shares', weights: { anna: 0, ben: 0, clara: 0 } })).split).toBe(
      'Choose at least one person to split with.',
    )
  })

  it('keeps the group order, no matter in which order people were ticked', () => {
    const result = validateDraft(draft({ included: ['clara', 'anna'] }), members)
    expect(result.ok && result.value.split).toEqual({ type: 'equal', memberIds: ['anna', 'clara'] })
  })

  it('leaves people with 0 shares out', () => {
    const result = validateDraft(draft({ splitType: 'shares', weights: { anna: 2, ben: 0, clara: 1 } }), members)
    expect(result.ok && result.value.split).toEqual({
      type: 'shares',
      shares: [
        { memberId: 'anna', weight: 2 },
        { memberId: 'clara', weight: 1 },
      ],
    })
  })

  it('accepts exact amounts that add up, empty fields count as 0', () => {
    const result = validateDraft(draft({ splitType: 'exact', exact: { anna: '50', ben: '', clara: '40,00' } }), members)
    expect(result.ok && result.value.split).toEqual({
      type: 'exact',
      amounts: [
        { memberId: 'anna', cents: 5000 },
        { memberId: 'clara', cents: 4000 },
      ],
    })
  })

  it('says how much is missing or too much for exact amounts', () => {
    expect(errorsOf(draft({ splitType: 'exact', exact: { anna: '50', ben: '', clara: '' } })).split).toBe(
      '€40.00 still has to be assigned.',
    )
    expect(errorsOf(draft({ splitType: 'exact', exact: { anna: '50', ben: '50', clara: '' } })).split).toBe(
      "That's €10.00 more than the total.",
    )
  })

  it('names the person whose exact amount is invalid', () => {
    expect(errorsOf(draft({ splitType: 'exact', exact: { anna: '90', ben: 'abc', clara: '' } })).split).toBe(
      'Check the amount for Ben.',
    )
  })
})

describe('previewShares', () => {
  it('shows each share while typing', () => {
    expect(previewShares(draft({ amount: '100' }), members)).toEqual(
      new Map([
        ['anna', 3334],
        ['ben', 3333],
        ['clara', 3333],
      ]),
    )
  })

  it('returns null while the amount is missing or the split is empty', () => {
    expect(previewShares(draft({ amount: '' }), members)).toBeNull()
    expect(previewShares(draft({ included: [] }), members)).toBeNull()
  })
})

describe('exactStatus', () => {
  const exact = (amount: string, values: Record<string, string>) =>
    exactStatus(draft({ amount, splitType: 'exact', exact: { anna: '', ben: '', clara: '', ...values } }), members)

  it('reports what is left to assign', () => {
    expect(exact('', {})).toEqual({ status: 'no-total' })
    expect(exact('90', { ben: 'x' })).toEqual({ status: 'invalid-input' })
    expect(exact('90', { anna: '30' })).toEqual({ status: 'ok', remaining: 6000 })
    expect(exact('90', { anna: '100' })).toEqual({ status: 'ok', remaining: -1000 })
  })
})

describe('draftFromExpense', () => {
  it('turns every example expense into a draft and back without changes', () => {
    for (const expense of exampleTrip.expenses) {
      const result = validateDraft(draftFromExpense(expense, exampleTrip.members), exampleTrip.members)
      expect(result.ok).toBe(true)
      if (result.ok) expect({ id: expense.id, ...result.value }).toEqual(expense)
    }
  })
})

describe('centsToInput', () => {
  it('formats cents for an input field', () => {
    expect(centsToInput(1250)).toBe('12.50')
    expect(centsToInput(5)).toBe('0.05')
    expect(centsToInput(80000)).toBe('800.00')
  })
})
