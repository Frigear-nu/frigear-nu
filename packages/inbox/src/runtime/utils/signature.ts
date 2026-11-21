// Webhook signatures: HMAC-SHA256 over the raw request body, in Web Crypto only so it runs on Workers.

const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** The hex HMAC-SHA256 of `body` with `secret`. */
export async function hmacSha256Hex(secret: string, body: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const data = typeof body === 'string' ? encoder.encode(body) : body
  return toHex(await crypto.subtle.sign('HMAC', key, data as BufferSource))
}

/** Compares two strings in time that does not depend on where they differ. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

/**
 * Whether `header` (`sha256=<hex>`, the shape of Meta's `X-Hub-Signature-256` and of the inbox email webhook's
 * `X-Inbox-Signature`) signs `body` with `secret`. An empty secret, a missing header or another algorithm never
 * verifies.
 */
export async function verifySha256Signature(secret: string | undefined, body: string | Uint8Array, header: string | null | undefined): Promise<boolean> {
  if (!secret || !header) return false
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim())
  if (!match) return false
  return timingSafeEqual(match[1]!.toLowerCase(), await hmacSha256Hex(secret, body))
}

/** The header value that signs `body`: what a provider (or a test) sends. */
export async function signSha256(secret: string, body: string | Uint8Array): Promise<string> {
  return `sha256=${await hmacSha256Hex(secret, body)}`
}
