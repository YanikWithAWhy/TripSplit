import type { Expense, Member } from './types'

/** Sample data for the demo screen and the scenario test. Replaced by real data from Supabase in phase 2. */
export const exampleTrip = {
  name: 'Lake Garda 2026',
  currency: 'EUR',
  members: [
    { id: 'anna', name: 'Anna' },
    { id: 'ben', name: 'Ben' },
    { id: 'clara', name: 'Clara' },
    { id: 'david', name: 'David' },
  ] satisfies Member[],
  expenses: [
    {
      id: 'e1',
      title: 'Holiday apartment',
      category: 'accommodation',
      amountCents: 80000,
      paidBy: 'anna',
      date: '2026-07-11',
      split: { type: 'equal', memberIds: ['anna', 'ben', 'clara', 'david'] },
    },
    {
      id: 'e2',
      title: 'Dinner by the lake',
      category: 'food',
      amountCents: 9550,
      paidBy: 'ben',
      date: '2026-07-12',
      split: { type: 'equal', memberIds: ['anna', 'ben', 'clara'] },
    },
    {
      id: 'e3',
      title: 'Rental car',
      category: 'transport',
      amountCents: 24000,
      paidBy: 'clara',
      date: '2026-07-13',
      split: {
        type: 'shares',
        shares: [
          { memberId: 'anna', weight: 1 },
          { memberId: 'clara', weight: 1 },
          { memberId: 'david', weight: 2 },
        ],
      },
    },
    {
      id: 'e4',
      title: 'Groceries',
      category: 'groceries',
      amountCents: 6320,
      paidBy: 'david',
      date: '2026-07-14',
      split: {
        type: 'exact',
        amounts: [
          { memberId: 'anna', cents: 1500 },
          { memberId: 'ben', cents: 1500 },
          { memberId: 'clara', cents: 1820 },
          { memberId: 'david', cents: 1500 },
        ],
      },
    },
  ] satisfies Expense[],
}
