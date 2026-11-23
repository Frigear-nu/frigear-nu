import { deflateSync } from 'node:zlib'

// Tiny test images. The PNG is a real (decodable) image; JPEG and WebP carry only the headers maps reads.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** A solid-colour RGB PNG of `width` by `height`, with a darker grid every 50 pixels. */
export function pngBytes(width: number, height: number, rgb: [number, number, number] = [235, 240, 245]): Uint8Array {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 2, 0, 0, 0], 8)
  const raw = new Uint8Array((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    for (let x = 0; x < width; x++) {
      const line = x % 50 === 0 || y % 50 === 0
      raw.set(line ? [180, 190, 200] : rgb, row + 1 + x * 3)
    }
  }
  const signature = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  const parts = [signature, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** A JPEG start with an APP0 segment and a baseline frame header of `width` by `height`. */
export function jpegBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xFF, 0xD8,
    0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08, height >> 8, height & 0xFF, width >> 8, width & 0xFF, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xFF, 0xD9,
  ])
}

/** A lossless WebP (VP8L) header of `width` by `height`. */
export function webpLosslessBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(30)
  out.set(new TextEncoder().encode('RIFF'), 0)
  out.set(new TextEncoder().encode('WEBPVP8L'), 8)
  out[20] = 0x2F
  const w = width - 1
  const h = height - 1
  // 14 bits of width, then 14 bits of height, little endian.
  const bits = w | (h << 14)
  out.set([bits & 0xFF, (bits >> 8) & 0xFF, (bits >> 16) & 0xFF, (bits >> 24) & 0xFF], 21)
  return out
}

/** A lossy WebP (VP8) header of `width` by `height`. */
export function webpLossyBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(30)
  out.set(new TextEncoder().encode('RIFF'), 0)
  out.set(new TextEncoder().encode('WEBPVP8 '), 8)
  out.set([0x9D, 0x01, 0x2A], 23)
  out.set([width & 0xFF, (width >> 8) & 0x3F, height & 0xFF, (height >> 8) & 0x3F], 26)
  return out
}

/** A WebP (VP8X) header of `width` by `height`. */
export function webpBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(30)
  const ascii = (text: string, at: number) => out.set(new TextEncoder().encode(text), at)
  ascii('RIFF', 0)
  ascii('WEBP', 8)
  ascii('VP8X', 12)
  const w = width - 1
  const h = height - 1
  out.set([w & 0xFF, (w >> 8) & 0xFF, (w >> 16) & 0xFF], 24)
  out.set([h & 0xFF, (h >> 8) & 0xFF, (h >> 16) & 0xFF], 27)
  return out
}
