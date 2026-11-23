/**
 * Turns a phone photo (often 3–10 MB) into a JPEG of a few hundred KB before it
 * is uploaded. Large enough to read the receipt, small enough to load quickly.
 */

/** Longest side in pixels. Receipts are long and narrow, so this keeps small print readable. */
export const RECEIPT_MAX_SIDE = 2000
export const RECEIPT_QUALITY = 0.8
/** Bigger files are almost certainly not a photo of a receipt. */
export const MAX_PHOTO_BYTES = 40 * 1024 * 1024

/** Scales width × height down (never up) so the longest side is at most `max`. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Throws an Error with a message meant for the user. */
export async function prepareReceiptImage(file: Blob): Promise<Blob> {
  // Some browsers leave the type empty (e.g. for HEIC); decoding decides then.
  if (file.type && !file.type.startsWith('image/')) throw new Error('Please choose a photo.')
  if (file.size > MAX_PHOTO_BYTES) throw new Error('This file is too large for a photo.')

  const image = await decode(file)
  try {
    const { width, height } = fitWithin(image.width, image.height, RECEIPT_MAX_SIDE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error("Couldn't prepare the photo.")
    // JPEG has no transparency: a white background instead of black.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image.source, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', RECEIPT_QUALITY))
    if (!blob) throw new Error("Couldn't prepare the photo.")
    return blob
  } finally {
    image.release()
  }
}

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

const UNREADABLE = "This photo can't be read here. Try a JPG or PNG."

/** Decodes the photo upright (phones store the rotation separately, in the EXIF data). */
async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // Older Safari versions: fall back to an <img>, which also applies the rotation.
    }
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error(UNREADABLE)
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
}
