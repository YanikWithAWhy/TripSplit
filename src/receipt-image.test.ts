import { describe, expect, it } from 'vitest'
import { fitWithin, MAX_PHOTO_BYTES, prepareReceiptImage, RECEIPT_MAX_SIDE } from './receipt-image'

describe('fitWithin', () => {
  it('shrinks the longest side to the limit and keeps the proportions', () => {
    expect(fitWithin(3024, 4032, RECEIPT_MAX_SIDE)).toEqual({ width: 1500, height: 2000 })
    expect(fitWithin(4000, 1000, 2000)).toEqual({ width: 2000, height: 500 })
  })

  it('never makes small photos bigger', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 })
  })

  it('keeps at least one pixel on each side', () => {
    expect(fitWithin(100_000, 10, 2000)).toEqual({ width: 2000, height: 1 })
  })
})

describe('prepareReceiptImage', () => {
  it('refuses files that are not images', async () => {
    await expect(prepareReceiptImage(new Blob(['%PDF'], { type: 'application/pdf' }))).rejects.toThrow('Please choose a photo.')
  })

  it('refuses huge files before trying to read them', async () => {
    const huge = { type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 } as Blob
    await expect(prepareReceiptImage(huge)).rejects.toThrow('too large')
  })
})
