import { Camera, LoaderCircle, Trash2 } from 'lucide-react'
import type { ChangeEvent } from 'react'
import type { ReceiptStorage } from '../data/receipts'
import { buttonGhost, buttonSecondary, labelText } from '../styles'
import type { ReceiptDraft } from '../useReceiptDraft'
import { FieldError } from './FieldError'
import { ReceiptImage, StoredReceipt } from './ReceiptImage'

interface ReceiptFieldProps {
  /** Id of the file input, e.g. to focus it when uploading failed. */
  id: string
  receipts: ReceiptStorage
  draft: ReceiptDraft
  /** While saving. */
  disabled: boolean
}

export function ReceiptField({ id, receipts, draft, disabled }: ReceiptFieldProps) {
  const { value, preparing, error } = draft
  const errorId = error ? `${id}-error` : undefined

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Lets the same photo be picked again after removing it.
    event.target.value = ''
    if (file) void draft.pick(file)
  }

  // No `capture` attribute: phones then offer both the camera and the photo library.
  const fileInput = (
    <input
      id={id}
      type="file"
      accept="image/*"
      onChange={onFile}
      disabled={disabled || preparing}
      aria-describedby={errorId}
      className="sr-only"
    />
  )
  const focusRing = 'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink'

  return (
    <div>
      <p className={labelText}>Receipt</p>
      {value.kind === 'none' ? (
        <label
          className={`mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center transition-colors duration-150 hover:border-ink-subtle hover:bg-raised/60 has-disabled:cursor-wait ${focusRing}`}
        >
          {fileInput}
          {preparing ? (
            <LoaderCircle className="size-5 animate-spin text-ink-muted" aria-hidden="true" />
          ) : (
            <Camera className="size-5 text-ink-muted" strokeWidth={1.75} aria-hidden="true" />
          )}
          <span className="font-medium">{preparing ? 'Preparing photo…' : 'Add a photo of the receipt'}</span>
          <span className="text-sm text-ink-muted">Optional. Take a picture or choose one from your photos.</span>
        </label>
      ) : (
        <>
          <div className="mt-2">
            {value.kind === 'saved' ? (
              <StoredReceipt receipts={receipts} path={value.path} label="Receipt photo" />
            ) : (
              <ReceiptImage src={{ status: 'ready', url: value.previewUrl }} label="New receipt photo" />
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className={`${buttonSecondary} cursor-pointer has-disabled:cursor-wait has-disabled:opacity-60 ${focusRing}`}>
              {fileInput}
              {preparing ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Camera className="size-4" aria-hidden="true" />
              )}
              {preparing ? 'Preparing…' : 'Replace photo'}
            </label>
            <button type="button" onClick={draft.remove} disabled={disabled || preparing} className={buttonGhost}>
              <Trash2 className="size-4" aria-hidden="true" />
              Remove
            </button>
          </div>
        </>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  )
}
