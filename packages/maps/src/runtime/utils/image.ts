// Reads the type and size of an underlay image from its bytes, so the server trusts neither the browser's content type
// nor the dimensions the client measured. Pure: PNG, JPEG and WebP only.

/** The image types an underlay may have. */
export const UNDERLAY_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type UnderlayType = typeof UNDERLAY_TYPES[number]

/** The default largest underlay: 10 MB. */
export const MAX_UNDERLAY_BYTES = 10 * 1024 * 1024

/** File extension of each underlay type, for the blob pathname. */
export const UNDERLAY_EXTENSIONS: Record<UnderlayType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length))

/** The image type of the bytes, or `null` when they are not a PNG, JPEG or WebP. */
export function sniffImageType(bytes: Uint8Array): UnderlayType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp'
  return null
}

const u16be = (bytes: Uint8Array, at: number) => (bytes[at]! << 8) | bytes[at + 1]!
const u16le = (bytes: Uint8Array, at: number) => bytes[at]! | (bytes[at + 1]! << 8)
const u24le = (bytes: Uint8Array, at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16)
const u32be = (bytes: Uint8Array, at: number) => ((bytes[at]! << 24) >>> 0) + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!

function jpegSize(bytes: Uint8Array): { width: number, height: number } | null {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xFF) return null
    const marker = bytes[offset + 1]!
    // Fill bytes and markers without a length.
    if (marker === 0xFF) {
      offset++
      continue
    }
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      offset += 2
      continue
    }
    const length = u16be(bytes, offset + 2)
    // Start-of-frame markers (C0-CF except C4, C8 and CC) hold the size.
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { height: u16be(bytes, offset + 5), width: u16be(bytes, offset + 7) }
    }
    offset += 2 + length
  }
  return null
}

function webpSize(bytes: Uint8Array): { width: number, height: number } | null {
  if (bytes.length < 30) return null
  const chunk = ascii(bytes, 12, 4)
  if (chunk === 'VP8X') return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 }
  if (chunk === 'VP8 ') return { width: u16le(bytes, 26) & 0x3FFF, height: u16le(bytes, 28) & 0x3FFF }
  if (chunk === 'VP8L') {
    const b0 = bytes[21]!
    const b1 = bytes[22]!
    const b2 = bytes[23]!
    const b3 = bytes[24]!
    return { width: 1 + (((b1 & 0x3F) << 8) | b0), height: 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6)) }
  }
  return null
}

/** The pixel size of a PNG, JPEG or WebP, or `null` when it cannot be read. */
export function imageSize(bytes: Uint8Array): { width: number, height: number } | null {
  const type = sniffImageType(bytes)
  if (type === 'image/png') return bytes.length >= 24 ? { width: u32be(bytes, 16), height: u32be(bytes, 20) } : null
  if (type === 'image/jpeg') return jpegSize(bytes)
  if (type === 'image/webp') return webpSize(bytes)
  return null
}
