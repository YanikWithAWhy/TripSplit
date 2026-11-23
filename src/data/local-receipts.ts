import { receiptPath, type ReceiptStorage } from './receipts'

/**
 * Photos in browser-only mode: kept in this browser's IndexedDB (localStorage
 * is far too small for pictures). Opened on first use only.
 */

const DB_NAME = 'tripsplit-receipts'
const STORE = 'photos'

let opening: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available.'))
        return
      }
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB failed to open.'))
    })
    // Allow another try later (e.g. after the user freed up space).
    opening.catch(() => {
      opening = null
    })
  }
  return opening
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const request = work(transaction.objectStore(STORE))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB request failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB request was aborted.'))
  })
}

export function createLocalReceipts(): ReceiptStorage {
  /** Object URLs handed out so far, released when the photo goes. */
  const urls = new Map<string, string>()
  const forget = (path: string) => {
    const url = urls.get(path)
    if (url) URL.revokeObjectURL(url)
    urls.delete(path)
  }

  return {
    async upload(tripId, expenseId, image) {
      const path = receiptPath(tripId, expenseId)
      try {
        await run('readwrite', (store) => store.put(image, path))
      } catch {
        throw new Error("Couldn't save the photo in this browser. It may be out of space.")
      }
      return path
    },

    async url(path) {
      const cached = urls.get(path)
      if (cached) return cached
      const image = await run('readonly', (store) => store.get(path) as IDBRequest<Blob | undefined>).catch(() => undefined)
      if (!image) throw new Error("Couldn't load the receipt.")
      const url = URL.createObjectURL(image)
      urls.set(path, url)
      return url
    },

    async remove(paths) {
      for (const path of paths) {
        await run('readwrite', (store) => store.delete(path))
        forget(path)
      }
    },

    async removeTrip(tripId) {
      const prefix = `${tripId}/`
      await run('readwrite', (store) => store.delete(IDBKeyRange.bound(prefix, `${prefix}￿`)))
      for (const path of urls.keys()) if (path.startsWith(prefix)) forget(path)
    },
  }
}
