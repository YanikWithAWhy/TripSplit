import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { receiptPath } from './receipts'
import { createSupabaseReceipts, friendlyStorageError } from './supabase-receipts'

const TRIP = '11111111-1111-4111-8111-111111111111'
const EXPENSE = '22222222-2222-4222-8222-222222222222'

type StorageResult = { data?: unknown; error: { message: string } | null }

function fakeClient({
  upload = { error: null },
  signed = { data: { signedUrl: 'https://example.test/signed' }, error: null },
  remove = { data: [], error: null },
  rows = [] as { receipt_path: string }[],
}: { upload?: StorageResult; signed?: StorageResult; remove?: StorageResult; rows?: { receipt_path: string }[] } = {}) {
  const bucket = {
    upload: vi.fn(async () => upload),
    createSignedUrl: vi.fn(async () => signed),
    remove: vi.fn(async () => remove),
  }
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    not: vi.fn(async () => ({ data: rows, error: null })),
  }
  const client = {
    storage: { from: vi.fn(() => bucket) },
    from: vi.fn(() => query),
  }
  return { bucket, query, client, receipts: createSupabaseReceipts(client as unknown as SupabaseClient) }
}

describe('receiptPath', () => {
  it('puts each photo in the folder of its trip and expense', () => {
    expect(receiptPath(TRIP, EXPENSE, 'abc')).toBe(`${TRIP}/${EXPENSE}/abc.jpg`)
  })

  it('matches the paths the database accepts (see the receipts migration)', () => {
    const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    const accepted = new RegExp(`^${uuid}/${uuid}/[A-Za-z0-9_-]{1,64}\\.(jpg|jpeg|png|webp)$`)
    expect(receiptPath(TRIP, EXPENSE)).toMatch(accepted)
  })
})

describe('createSupabaseReceipts', () => {
  it('uploads the photo as a new JPEG file into the private bucket', async () => {
    const { client, bucket, receipts } = fakeClient()
    const image = new Blob(['x'], { type: 'image/jpeg' })
    const path = await receipts.upload(TRIP, EXPENSE, image)
    expect(path.startsWith(`${TRIP}/${EXPENSE}/`)).toBe(true)
    expect(client.storage.from).toHaveBeenCalledWith('receipts')
    expect(bucket.upload).toHaveBeenCalledWith(path, image, expect.objectContaining({ contentType: 'image/jpeg', upsert: false }))
  })

  it('explains failed uploads', async () => {
    const { receipts } = fakeClient({ upload: { error: { message: 'new row violates row-level security policy' } } })
    await expect(receipts.upload(TRIP, EXPENSE, new Blob())).rejects.toThrow("You can't change the receipt of this expense.")
  })

  it('reuses signed links until shortly before they expire', async () => {
    const { bucket, receipts } = fakeClient()
    const path = receiptPath(TRIP, EXPENSE)
    expect(await receipts.url(path)).toBe('https://example.test/signed')
    expect(await receipts.url(path)).toBe('https://example.test/signed')
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(1)
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(path, 3600)
  })

  it('removes the photos of a trip before the trip is deleted', async () => {
    const paths = [receiptPath(TRIP, EXPENSE), receiptPath(TRIP, EXPENSE)]
    const { client, query, bucket, receipts } = fakeClient({ rows: paths.map((receipt_path) => ({ receipt_path })) })
    await receipts.removeTrip(TRIP)
    expect(client.from).toHaveBeenCalledWith('expenses')
    expect(query.eq).toHaveBeenCalledWith('trip_id', TRIP)
    expect(bucket.remove).toHaveBeenCalledWith(paths)
  })

  it('skips the request when there is nothing to remove', async () => {
    const { bucket, receipts } = fakeClient()
    await receipts.removeTrip(TRIP)
    await receipts.remove([])
    expect(bucket.remove).not.toHaveBeenCalled()
  })
})

describe('friendlyStorageError', () => {
  it('turns storage errors into plain words', () => {
    expect(friendlyStorageError('Bucket not found')).toBe("Receipts aren't set up on the server yet.")
    expect(friendlyStorageError('The object exceeded the maximum allowed size')).toBe('This photo is too large.')
    expect(friendlyStorageError('TypeError: Failed to fetch')).toMatch(/connection/)
    expect(friendlyStorageError('Something else')).toBe('Something else')
  })
})
