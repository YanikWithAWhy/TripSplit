import { describe, expect, it } from 'vitest'
import { computeBalances, settleUp } from './lib'
import {
  addExpense,
  addSettlement,
  applyTripDraft,
  clearSettlements,
  deleteExpense,
  demoTrip,
  draftInvites,
  findMe,
  memberUsage,
  newTripDraft,
  tripToDraft,
  updateExpense,
  validateTripDraft,
  withMeFirst,
  type Trip,
  type TripDraft,
} from './trips'

const now = '2026-11-22T10:00:00.000Z'

function counter() {
  let n = 0
  return () => `id-${++n}`
}

function tripWith(names: string[]): Trip {
  return {
    id: 't1',
    name: 'Test',
    currency: 'EUR',
    members: names.map((name) => ({ id: name.toLowerCase(), name })),
    expenses: [],
    settlements: [],
    createdAt: now,
  }
}

describe('new trips', () => {
  it('starts with two empty rows for people', () => {
    expect(newTripDraft(counter())).toEqual({
      name: '',
      members: [
        { id: 'id-1', name: '', isNew: true },
        { id: 'id-2', name: '', isNew: true },
      ],
    })
  })

  it('creates a trip with trimmed names and no expenses', () => {
    const draft: TripDraft = {
      name: '  Ski weekend ',
      members: [
        { id: 'a', name: ' Anna ', isNew: true },
        { id: 'b', name: 'Ben', isNew: true },
      ],
    }
    expect(validateTripDraft(draft)).toBeNull()
    expect(applyTripDraft(draft, null, { id: 'trip-1', now })).toEqual({
      id: 'trip-1',
      name: 'Ski weekend',
      currency: 'EUR',
      members: [
        { id: 'a', name: 'Anna' },
        { id: 'b', name: 'Ben' },
      ],
      expenses: [],
      settlements: [],
      createdAt: now,
    })
  })
})

describe('validateTripDraft', () => {
  const draft = (name: string, people: string[]): TripDraft => ({
    name,
    members: people.map((p, i) => ({ id: `m${i}`, name: p, isNew: true })),
  })

  it('needs a trip name and at least two people', () => {
    expect(validateTripDraft(draft('', ['Anna']))).toEqual({
      name: 'Give the trip a name.',
      members: 'Add at least two people.',
      memberNames: {},
    })
  })

  it('needs a name for every person', () => {
    expect(validateTripDraft(draft('Trip', ['Anna', '  ']))?.memberNames).toEqual({ m1: 'Enter a name.' })
  })

  it('rejects the same name twice, ignoring case and spaces', () => {
    expect(validateTripDraft(draft('Trip', ['Anna', ' anna ']))?.memberNames).toEqual({
      m1: 'This name is already in the trip.',
    })
  })

  it('limits name lengths', () => {
    expect(validateTripDraft(draft('x'.repeat(61), ['Anna', 'Ben']))?.name).toMatch(/under 60/)
    expect(validateTripDraft(draft('Trip', ['Anna', 'x'.repeat(31)]))?.memberNames.m1).toMatch(/under 30/)
  })
})

describe('editing members', () => {
  const trip = addExpense(tripWith(['Anna', 'Ben', 'Clara']), {
    id: 'e1',
    title: 'Dinner',
    amountCents: 3000,
    paidBy: 'anna',
    date: '2026-07-12',
    split: { type: 'equal', memberIds: ['anna', 'ben'] },
  })

  it('counts where a member is used', () => {
    expect(memberUsage(trip, 'anna')).toBe(1)
    expect(memberUsage(trip, 'ben')).toBe(1)
    expect(memberUsage(trip, 'clara')).toBe(0)
  })

  it('counts repayments, but not deleted expenses', () => {
    const settled = addSettlement(deleteExpense(trip, 'e1', now), { from: 'clara', to: 'anna', cents: 100 }, { id: 's1', now })
    expect(memberUsage(settled, 'ben')).toBe(0)
    expect(memberUsage(settled, 'clara')).toBe(1)
  })

  it('allows removing someone who is not part of any expense', () => {
    const draft = tripToDraft(trip)
    draft.members = draft.members.filter((m) => m.id !== 'clara')
    expect(validateTripDraft(draft, trip)).toBeNull()
    expect(applyTripDraft(draft, trip, { id: 'x', now }).members.map((m) => m.id)).toEqual(['anna', 'ben'])
  })

  it('blocks removing someone who is part of an expense', () => {
    const draft = tripToDraft(trip)
    draft.members = draft.members.filter((m) => m.id !== 'ben')
    expect(validateTripDraft(draft, trip)?.members).toBe(
      "Ben is part of expenses or repayments and can't be removed.",
    )
  })

  it('keeps expenses and balances when renaming and adding people', () => {
    const draft = tripToDraft(trip)
    draft.name = 'Renamed'
    draft.members[0].name = 'Annika'
    draft.members.push({ id: 'dave', name: 'Dave', isNew: true })
    const updated = applyTripDraft(draft, trip, { id: 'x', now })

    expect(updated.name).toBe('Renamed')
    expect(updated.members).toEqual([
      { id: 'anna', name: 'Annika' },
      { id: 'ben', name: 'Ben' },
      { id: 'clara', name: 'Clara' },
      { id: 'dave', name: 'Dave' },
    ])
    expect(updated.expenses).toBe(trip.expenses)
    expect(Object.fromEntries(computeBalances(updated.members.map((m) => m.id), updated.expenses))).toEqual({
      anna: 1500,
      ben: -1500,
      clara: 0,
      dave: 0,
    })
  })
})

describe('expenses and repayments', () => {
  const base = tripWith(['Anna', 'Ben'])
  const expense = {
    title: 'Taxi',
    amountCents: 2000,
    paidBy: 'anna',
    date: '2026-07-12',
    split: { type: 'equal' as const, memberIds: ['anna', 'ben'] },
  }

  it('adds, updates and soft-deletes expenses', () => {
    const added = addExpense(base, { ...expense, id: 'e1' })
    const updated = updateExpense(added, 'e1', { ...expense, amountCents: 3000 })
    const deleted = deleteExpense(updated, 'e1', now)

    expect(added.expenses).toHaveLength(1)
    expect(updated.expenses[0]).toEqual({ ...expense, id: 'e1', amountCents: 3000 })
    expect(deleted.expenses[0].deletedAt).toBe(now)
    expect(base.expenses).toHaveLength(0)
  })

  it('records a suggested payment as a repayment, which settles the trip', () => {
    const trip = addExpense(base, { ...expense, id: 'e1' })
    const ids = trip.members.map((m) => m.id)
    const [transfer] = settleUp(computeBalances(ids, trip.expenses))
    const settled = addSettlement(trip, transfer, { id: 's1', now })

    expect(settled.settlements).toEqual([{ id: 's1', from: 'ben', to: 'anna', amountCents: 1000, date: now }])
    expect(settleUp(computeBalances(ids, settled.expenses, settled.settlements))).toEqual([])
    expect(clearSettlements(settled).settlements).toEqual([])
  })
})

describe('demoTrip', () => {
  it('uses the example data', () => {
    const trip = demoTrip('demo', now)
    expect(trip.members).toHaveLength(4)
    expect(trip.expenses).toHaveLength(4)
    expect(validateTripDraft(tripToDraft(trip), trip)).toBeNull()
  })
})

describe('you in a trip', () => {
  const me = { userId: 'user-1', name: 'anna' }

  it('starts a new trip with just you; everyone else is invited', () => {
    const draft = newTripDraft(counter(), me)
    expect(draft.members).toEqual([{ id: 'id-1', name: 'anna', isNew: true, userId: 'user-1' }])
    draft.name = 'Weekend'
    expect(validateTripDraft(draft, undefined, { invitePeople: true })?.members).toBe('Invite at least one person.')

    draft.members.push({ id: 'id-2', name: 'ben', isNew: true, inviteUsername: 'ben' })
    expect(validateTripDraft(draft, undefined, { invitePeople: true })).toBeNull()
    expect(draftInvites(draft)).toEqual([{ memberId: 'id-2', username: 'ben' }])
    const trip = applyTripDraft(draft, null, { id: 't', now })
    expect(trip.members).toEqual([
      { id: 'id-1', name: 'anna', userId: 'user-1' },
      { id: 'id-2', name: 'ben' },
    ])
    expect(findMe(trip, 'user-1')).toBe('id-1')
    expect(findMe(trip, 'someone-else')).toBeNull()
    expect(findMe(trip, null)).toBeNull()
  })

  it('keeps the link when editing and refuses to remove you', () => {
    const trip = applyTripDraft(
      { name: 'Weekend', members: [{ id: 'a', name: 'anna', isNew: true, userId: 'user-1' }, { id: 'b', name: 'Ben', isNew: true }, { id: 'c', name: 'Clara', isNew: true }] },
      null,
      { id: 't', now },
    )
    const draft = tripToDraft(trip)
    expect(draft.members[0].userId).toBe('user-1')
    expect(applyTripDraft(draft, trip, { id: 't', now }).members[0]).toEqual({ id: 'a', name: 'anna', userId: 'user-1' })

    draft.members = draft.members.filter((m) => m.id !== 'a')
    expect(validateTripDraft(draft, trip)?.members).toBe("anna is linked to an account and can't be removed.")
  })

  it('refuses the same username twice', () => {
    const draft = newTripDraft(counter(), me)
    draft.name = 'Weekend'
    draft.members.push(
      { id: 'b1', name: 'ben', isNew: true, inviteUsername: 'ben' },
      { id: 'b2', name: 'Ben K', isNew: true, inviteUsername: 'ben' },
    )
    expect(validateTripDraft(draft, undefined, { invitePeople: true })?.memberNames).toEqual({
      b2: '@ben is invited twice.',
    })
  })

  it('turns the first demo person into you', () => {
    const trip = withMeFirst(demoTrip('demo', now), me)
    expect(trip.members[0]).toEqual({ id: 'anna', name: 'anna', userId: 'user-1' })
    expect(trip.members.slice(1).every((m) => !m.userId)).toBe(true)
  })
})
