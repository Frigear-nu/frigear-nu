import { describe, expect, it } from 'vitest'
import { imageSize, sniffImageType } from '../../src/runtime/utils/image'
import { jpegBytes, pngBytes, webpBytes } from '../images'

describe('underlay images', () => {
  it('knows PNG, JPEG and WebP by their bytes and reads their size', () => {
    expect(sniffImageType(pngBytes(40, 30))).toBe('image/png')
    expect(imageSize(pngBytes(40, 30))).toEqual({ width: 40, height: 30 })
    expect(sniffImageType(jpegBytes(64, 48))).toBe('image/jpeg')
    expect(imageSize(jpegBytes(64, 48))).toEqual({ width: 64, height: 48 })
    expect(sniffImageType(webpBytes(120, 90))).toBe('image/webp')
    expect(imageSize(webpBytes(120, 90))).toEqual({ width: 120, height: 90 })
  })

  it('refuses anything else, whatever it is called', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(sniffImageType(svg)).toBeNull()
    expect(imageSize(svg)).toBeNull()
    expect(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull()
  })
})
