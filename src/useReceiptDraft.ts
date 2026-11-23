import { useEffect, useState } from 'react'
import { prepareReceiptImage } from './receipt-image'

/** The receipt in the expense form: none, the stored one, or a new photo not uploaded yet. */
export type ReceiptValue =
  | { kind: 'none' }
  | { kind: 'saved'; path: string }
  | { kind: 'new'; image: Blob; previewUrl: string }

export interface ReceiptDraft {
  value: ReceiptValue
  preparing: boolean
  error: string | undefined
  setError: (message: string | undefined) => void
  pick: (file: File) => Promise<void>
  remove: () => void
}

/** State of the receipt in the expense form. New photos are shrunk right away and uploaded only on save. */
export function useReceiptDraft(initialPath: string | undefined): ReceiptDraft {
  const [value, setValue] = useState<ReceiptValue>(initialPath ? { kind: 'saved', path: initialPath } : { kind: 'none' })
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | undefined>()

  // Release the preview once it is replaced or the form closes.
  const previewUrl = value.kind === 'new' ? value.previewUrl : null
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )

  const pick = async (file: File) => {
    setPreparing(true)
    setError(undefined)
    try {
      const image = await prepareReceiptImage(file)
      setValue({ kind: 'new', image, previewUrl: URL.createObjectURL(image) })
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Couldn't prepare the photo.")
    } finally {
      setPreparing(false)
    }
  }

  const remove = () => {
    setValue({ kind: 'none' })
    setError(undefined)
  }

  return { value, preparing, error, setError, pick, remove }
}
