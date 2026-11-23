import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { demoTrip } from '../trips'
import { createSupabaseBackend } from './supabase-backend'

/** Records what the backend asks of Supabase; `rpcError` makes save_expense fail. */
function fakeClient({ rpcError = null as { message: string } | null, receiptRows = [] as { receipt_path: string }[] } = {}) {
  const calls: string[] = []
  const bucket = {
    remove: vi.fn(async (paths: string[]) => {
      calls.push(`remove ${paths.join(',')}`)
      return { data: [], error: null }
    }),
  }
  const table = (name: string) => {
    const query = {
      select: vi.fn(() => query),
      update: vi.fn((values: Record<string, unknown>) => {
        calls.push(`update ${name} ${JSON.stringify(values)}`)
        return query
      }),
      delete: vi.fn(() => {
        calls.push(`delete ${name}`)
        return query
      }),
      eq: vi.fn(() => query),
      not: vi.fn(async () => ({ data: receiptRows, error: null })),
      then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
    }
    return query
  }
  const client = {
    rpc: vi.fn(async (name: string) => {
      calls.push(`rpc ${name}`)
      return { data: null, error: rpcError }
    }),
    from: vi.fn(table),
    storage: { from: vi.fn(() => bucket) },
  }
  return { calls, backend: createSupabaseBackend(client as unknown as SupabaseClient) }
}

const trip = demoTrip('t1', '2026-11-23T10:00:00.000Z')
const expense = { ...trip.expenses[0], receiptPath: 't1/e1/new.jpg' }

describe('supabase backend: receipt photos', () => {
  it('removes the replaced photo once the expense is saved', async () => {
    const { calls, backend } = fakeClient()
    await backend.persist(
      { type: 'saveExpense', tripId: 't1', expense, uploadedReceipt: 't1/e1/new.jpg', replacedReceipt: 't1/e1/old.jpg' },
      [trip],
    )
    expect(calls).toEqual(['rpc save_expense', 'remove t1/e1/old.jpg'])
  })

  it('removes the just-uploaded photo again when saving fails', async () => {
    const { calls, backend } = fakeClient({ rpcError: { message: 'Only the person who added this expense can change it.' } })
    await expect(
      backend.persist({ type: 'saveExpense', tripId: 't1', expense, uploadedReceipt: 't1/e1/new.jpg' }, [trip]),
    ).rejects.toThrow('Only the person')
    expect(calls).toEqual(['rpc save_expense', 'remove t1/e1/new.jpg'])
  })

  it('deletes the photo along with the expense', async () => {
    const { calls, backend } = fakeClient()
    await backend.persist(
      { type: 'deleteExpense', tripId: 't1', expenseId: 'e1', deletedAt: '2026-11-23T11:00:00.000Z', receiptPath: 't1/e1/p.jpg' },
      [trip],
    )
    expect(calls).toEqual([
      'update expenses {"deleted_at":"2026-11-23T11:00:00.000Z","receipt_path":null}',
      'remove t1/e1/p.jpg',
    ])
  })

  it("removes a trip's photos before the trip itself", async () => {
    const { calls, backend } = fakeClient({ receiptRows: [{ receipt_path: 't1/e1/a.jpg' }, { receipt_path: 't1/e2/b.jpg' }] })
    await backend.persist({ type: 'deleteTrip', tripId: 't1' }, [])
    expect(calls).toEqual(['remove t1/e1/a.jpg,t1/e2/b.jpg', 'delete trips'])
  })
})
