import { describe, expect, it } from 'vitest'
import { demoTrip, remapIds, type Trip } from '../trips'
import { applyAction } from './actions'
import { accountIds, saveExpenseArgs, splitFromRows, splitToPayload, tripFromRow } from './supabase-mapping'

const now = '2026-11-22T10:00:00.000Z'
let n = 0
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

describe('applyAction', () => {
  const trip = demoTrip('t1', now)
  const trips: Trip[] = [trip]

  it('creates and deletes trips', () => {
    const other = { ...trip, id: 't2', name: 'Other' }
    const created = applyAction(trips, { type: 'createTrip', trip: other })
    expect(created.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(applyAction(created, { type: 'deleteTrip', tripId: 't1' }).map((t) => t.id)).toEqual(['t2'])
  })

  it('adds a new expense and replaces an existing one', () => {
    const expense = { ...trip.expenses[0], id: 'new', title: 'Taxi' }
    const added = applyAction(trips, { type: 'saveExpense', tripId: 't1', expense })
    expect(added[0].expenses).toHaveLength(trip.expenses.length + 1)

    const edited = applyAction(added, { type: 'saveExpense', tripId: 't1', expense: { ...expense, title: 'Bus' } })
    expect(edited[0].expenses).toHaveLength(trip.expenses.length + 1)
    expect(edited[0].expenses.at(-1)?.title).toBe('Bus')
  })

  it('soft-deletes expenses and records or clears repayments', () => {
    const deleted = applyAction(trips, { type: 'deleteExpense', tripId: 't1', expenseId: 'e1', deletedAt: now })
    expect(deleted[0].expenses[0].deletedAt).toBe(now)

    const settlement = { id: 's1', from: 'ben', to: 'anna', amountCents: 100, date: now }
    const settled = applyAction(trips, { type: 'addSettlement', tripId: 't1', settlement })
    expect(settled[0].settlements).toEqual([settlement])
    const undone = applyAction(settled, { type: 'removeSettlements', tripId: 't1', settlementIds: ['s1'] })
    expect(undone[0].settlements).toEqual([])
    expect(applyAction(settled, { type: 'removeSettlements', tripId: 't1', settlementIds: ['other'] })[0].settlements).toEqual([settlement])
  })

  it('updates name and people, and leaves other trips alone', () => {
    const two = [...trips, { ...trip, id: 't2' }]
    const members = [{ id: 'anna', name: 'Annika' }, ...trip.members.slice(1)]
    const updated = applyAction(two, { type: 'updateTripDetails', tripId: 't1', name: 'Renamed', members })
    expect(updated[0]).toMatchObject({ name: 'Renamed', members })
    expect(updated[1]).toBe(two[1])
  })
})

describe('remapIds', () => {
  it('gives everything new ids and keeps references intact', () => {
    const original = demoTrip('t1', now)
    const remapped = remapIds(original, newId)
    const memberIds = new Set(remapped.members.map((m) => m.id))

    expect(remapped.id).not.toBe('t1')
    expect([...memberIds].some((id) => original.members.some((m) => m.id === id))).toBe(false)
    for (const expense of remapped.expenses) {
      expect(memberIds.has(expense.paidBy)).toBe(true)
      for (const row of splitToPayload(expense.split)) expect(memberIds.has(row.member_id)).toBe(true)
    }
    expect(remapped.expenses.map((e) => e.amountCents)).toEqual(original.expenses.map((e) => e.amountCents))
  })
})

describe('supabase mapping', () => {
  it('round-trips every split type through database rows', () => {
    for (const expense of demoTrip('t1', now).expenses) {
      const rows = splitToPayload(expense.split).map((row, position) => ({
        member_id: row.member_id,
        position,
        weight: 'weight' in row ? row.weight : null,
        amount_cents: 'amount_cents' in row ? row.amount_cents : null,
      }))
      expect(splitFromRows(expense.split.type, rows.reverse())).toEqual(expense.split)
    }
  })

  it('builds the save_expense arguments', () => {
    const expense = demoTrip('t1', now).expenses[2]
    expect(saveExpenseArgs('t1', 'EUR', expense)).toEqual({
      p_expense: {
        id: 'e3',
        trip_id: 't1',
        title: 'Rental car',
        amount_cents: 24000,
        currency: 'EUR',
        paid_by: 'clara',
        spent_on: '2026-07-13',
        category: 'transport',
        split_type: 'shares',
      },
      p_splits: [
        { member_id: 'anna', weight: 1 },
        { member_id: 'clara', weight: 1 },
        { member_id: 'david', weight: 2 },
      ],
    })
  })
})

describe('invitations and usernames from the database', () => {
  const row = {
    id: 't1',
    name: 'Trip',
    currency: 'EUR',
    created_at: '2026-11-22T10:00:00Z',
    created_by: 'u-anna',
    members: [
      { id: 'm1', name: 'Anna', position: 0, user_id: 'u-anna', deleted_at: null },
      { id: 'm2', name: 'Ben', position: 1, user_id: null, deleted_at: null },
      { id: 'm3', name: 'Gone', position: 2, user_id: 'u-gone', deleted_at: '2026-11-22T11:00:00Z' },
    ],
    expenses: [],
    settlements: [],
    trip_invitations: [
      { id: 'i1', member_id: 'm2', invited_user: 'u-ben', status: 'pending' },
      { id: 'i0', member_id: 'm2', invited_user: 'u-old', status: 'declined' },
    ],
  }

  it('collects the accounts whose usernames are needed', () => {
    expect(accountIds([row])).toEqual(['u-anna', 'u-ben'])
  })

  it('adds usernames and keeps only open invitations', () => {
    const trip = tripFromRow(row, new Map([['u-anna', 'anna'], ['u-ben', 'ben']]))
    expect(trip.members).toEqual([
      { id: 'm1', name: 'Anna', userId: 'u-anna', username: 'anna' },
      { id: 'm2', name: 'Ben' },
    ])
    expect(trip.invitations).toEqual([{ id: 'i1', memberId: 'm2', userId: 'u-ben', username: 'ben' }])
  })
})
