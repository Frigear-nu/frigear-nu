// Webhook signatures: HMAC-SHA256 over the raw request body, in Web Crypto only so it runs on Workers.
import { hmacSha256Hex, timingSafeEqual } from '@frigear-nu/module-kit/crypto'
import { randomToken } from '@frigear-nu/module-kit/id'

/**
 * Compares a secret a caller sent with the configured one in constant time, whatever their lengths: both are HMAC-ed
 * with a fresh random key and the equal-length digests are compared, so neither the secret's length nor where the two
 * differ shows in the timing. For tokens compared as text (Meta's `hub.verify_token`).
 */
export async function secretsEqual(given: string, expected: string): Promise<boolean> {
  const key = randomToken(32, 'hex')
  const [a, b] = await Promise.all([hmacSha256Hex(key, given), hmacSha256Hex(key, expected)])
  return timingSafeEqual(a, b)
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
