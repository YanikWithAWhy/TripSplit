import { Expand, ImageOff } from 'lucide-react'
import type { ReceiptStorage } from '../data/receipts'
import { useReceiptUrl, type ReceiptUrl } from '../data/useReceiptUrl'

/** A receipt photo. Tapping it opens the full-size picture in a new tab, for zooming in. */
export function ReceiptImage({ src, label }: { src: ReceiptUrl; label: string }) {
  if (src.status === 'loading') {
    return (
      <div role="status" className="h-48 animate-pulse rounded-2xl border border-line bg-raised">
        <span className="sr-only">Loading the receipt…</span>
      </div>
    )
  }
  if (src.status === 'failed') {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-line px-4 py-3 text-sm text-ink-muted">
        <ImageOff className="size-4 shrink-0" aria-hidden="true" />
        {src.message}
      </p>
    )
  }
  return (
    <a
      href={src.url}
      target="_blank"
      rel="noreferrer"
      className="group relative block animate-enter overflow-hidden rounded-2xl border border-line bg-raised transition-colors duration-150 hover:border-ink-subtle"
    >
      <img src={src.url} alt={label} className="max-h-72 w-full object-contain" />
      <span className="absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas/85 px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-colors duration-150 group-hover:border-ink-subtle">
        <Expand className="size-3.5" aria-hidden="true" />
        Full size
      </span>
    </a>
  )
}

/** A photo that is already stored (Supabase or this browser). */
export function StoredReceipt({ receipts, path, label }: { receipts: ReceiptStorage; path: string; label: string }) {
  return <ReceiptImage src={useReceiptUrl(receipts, path)} label={label} />
}
