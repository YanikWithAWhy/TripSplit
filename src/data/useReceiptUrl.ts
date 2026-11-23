import { useEffect, useState } from 'react'
import type { ReceiptStorage } from './receipts'

export type ReceiptUrl = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'failed'; message: string }

/** The address to show a stored receipt photo from. Loads again when the path changes. */
export function useReceiptUrl(receipts: ReceiptStorage, path: string | undefined): ReceiptUrl {
  const [result, setResult] = useState<{ path: string; value: ReceiptUrl } | null>(null)

  useEffect(() => {
    if (!path) return
    let active = true
    receipts.url(path).then(
      (url) => active && setResult({ path, value: { status: 'ready', url } }),
      (error: unknown) =>
        active &&
        setResult({
          path,
          value: { status: 'failed', message: error instanceof Error ? error.message : "Couldn't load the receipt." },
        }),
    )
    return () => {
      active = false
    }
  }, [receipts, path])

  return result && result.path === path ? result.value : { status: 'loading' }
}
