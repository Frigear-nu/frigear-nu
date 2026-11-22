// `@frigear-nu/module-kit/crypto`: hashes, HMAC, HKDF, constant-time comparison and the byte encodings, with Web
// Crypto only, so the same code runs in Node, on Cloudflare Workers and in the browser. Also exported from
// `@frigear-nu/module-kit/server`.

const encoder = new TextEncoder()

type Bytes = ArrayBuffer | ArrayBufferView

const view = (bytes: Bytes): Uint8Array =>
  bytes instanceof Uint8Array ? bytes : ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes)

const toBytes = (value: string | Uint8Array): Uint8Array<ArrayBuffer> =>
  (typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value)) as Uint8Array<ArrayBuffer>

/** Lowercase hex of `bytes`. */
export function bytesToHex(bytes: Bytes): string {
  let hex = ''
  for (const byte of view(bytes)) hex += byte.toString(16).padStart(2, '0')
  return hex
}

/** Unpadded base64url (RFC 4648 §5) of `bytes`. */
export function bytesToBase64Url(bytes: Bytes): string {
  let binary = ''
  for (const byte of view(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** The bytes of a base64url (or base64) string, padded or not. Throws on characters outside the alphabet. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** SHA-256 of a string (UTF-8) or bytes, as lowercase hex (64 characters). */
export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', toBytes(value)))
}

/** SHA-256 of a string (UTF-8) or bytes, as unpadded base64url (43 characters). Also PKCE's S256 challenge. */
export async function sha256Base64Url(value: string | Uint8Array): Promise<string> {
  return bytesToBase64Url(await crypto.subtle.digest('SHA-256', toBytes(value)))
}

/** HMAC-SHA-256 of `data` with `secret` (both UTF-8 when strings), as lowercase hex (64 characters). */
export async function hmacSha256Hex(secret: string | Uint8Array, data: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', toBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return bytesToHex(await crypto.subtle.sign('HMAC', key, toBytes(data)))
}

/** Whether `signature` (hex, any case) is the HMAC-SHA-256 of `data` with `secret`, compared in constant time. */
export async function verifyHmacSha256Hex(secret: string | Uint8Array, data: string | Uint8Array, signature: string): Promise<boolean> {
  return timingSafeEqual(signature.toLowerCase(), await hmacSha256Hex(secret, data))
}

/**
 * Compares two strings in time that depends only on the longer length, never on where they differ. Use it for
 * secrets, signatures and token hashes. Strings of different lengths are never equal.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  let diff = left.length ^ right.length
  for (let index = 0; index < Math.max(left.length, right.length); index++) diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  return diff === 0
}

/**
 * A key derived from a secret string with HKDF-SHA-256, so any secret (an env value, a session password) gives a
 * full-strength key. `salt` and `info` keep keys for different uses apart; never reuse a pair for another purpose.
 *
 *     const key = await deriveHkdfKey(secret, { salt: '@frigear-nu/shifts', info: 'shift_station_tokens' },
 *       { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign', 'verify'])
 */
export async function deriveHkdfKey(
  secret: string,
  { salt, info }: { salt: string, info: string },
  algorithm: Parameters<SubtleCrypto['deriveKey']>[2],
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(salt), info: encoder.encode(info) }, material, algorithm, false, usages)
}
