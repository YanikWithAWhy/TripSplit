/**
 * Photos of receipts, attached to expenses. Stored in Supabase Storage (see
 * supabase-receipts.ts) or, in browser-only mode, in this browser (local-receipts.ts).
 * Paths look like "<trip id>/<expense id>/<file id>.jpg", the same in both places.
 * All methods throw an Error with a message meant for the user.
 */
export interface ReceiptStorage {
  /** Saves the photo for this expense and returns its path. */
  upload(tripId: string, expenseId: string, image: Blob): Promise<string>
  /** An address the photo can be shown from (for Supabase a short-lived signed link). */
  url(path: string): Promise<string>
  remove(paths: string[]): Promise<void>
  /** Removes every photo of a trip. Called right before the trip itself is deleted. */
  removeTrip(tripId: string): Promise<void>
}

export const RECEIPTS_BUCKET = 'receipts'

/** Where the photo of an expense goes. Each photo gets a new file, so links never show an old one. */
export function receiptPath(tripId: string, expenseId: string, fileId: string = crypto.randomUUID()): string {
  return `${tripId}/${expenseId}/${fileId}.jpg`
}
