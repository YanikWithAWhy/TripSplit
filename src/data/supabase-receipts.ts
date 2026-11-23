import type { SupabaseClient } from '@supabase/supabase-js'
import { receiptPath, RECEIPTS_BUCKET, type ReceiptStorage } from './receipts'

/** How long a link to a photo works. Only people on the trip get one (see the receipts migration). */
const SIGNED_URL_SECONDS = 60 * 60
/** Links are renewed this long before they stop working. */
const RENEW_BEFORE_MS = 5 * 60 * 1000

/** Storage errors in words people understand. */
export function friendlyStorageError(message: string): string {
  if (/bucket not found/i.test(message)) return "Receipts aren't set up on the server yet."
  if (/row-level security|unauthorized|not allowed/i.test(message)) return "You can't change the receipt of this expense."
  if (/maximum allowed size|too large/i.test(message)) return 'This photo is too large.'
  if (/failed to fetch|load failed|network/i.test(message)) return "Couldn't reach the server. Check your connection and try again."
  return message
}

/** Photos in the private "receipts" bucket. Row level security decides who may see or change them. */
export function createSupabaseReceipts(client: SupabaseClient): ReceiptStorage {
  const bucket = () => client.storage.from(RECEIPTS_BUCKET)
  const links = new Map<string, { url: string; renewAt: number }>()

  const remove = async (paths: string[]) => {
    if (paths.length === 0) return
    const { error } = await bucket().remove(paths)
    if (error) throw new Error(friendlyStorageError(error.message))
    for (const path of paths) links.delete(path)
  }

  return {
    async upload(tripId, expenseId, image) {
      const path = receiptPath(tripId, expenseId)
      const { error } = await bucket().upload(path, image, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      })
      if (error) throw new Error(friendlyStorageError(error.message))
      return path
    },

    async url(path) {
      const cached = links.get(path)
      if (cached && cached.renewAt > Date.now()) return cached.url
      const { data, error } = await bucket().createSignedUrl(path, SIGNED_URL_SECONDS)
      if (error || !data) throw new Error("Couldn't load the receipt.")
      links.set(path, { url: data.signedUrl, renewAt: Date.now() + SIGNED_URL_SECONDS * 1000 - RENEW_BEFORE_MS })
      return data.signedUrl
    },

    remove,

    async removeTrip(tripId) {
      const { data, error } = await client
        .from('expenses')
        .select('receipt_path')
        .eq('trip_id', tripId)
        .not('receipt_path', 'is', null)
      if (error) throw new Error(error.message)
      await remove((data as { receipt_path: string }[]).map((row) => row.receipt_path))
    },
  }
}
