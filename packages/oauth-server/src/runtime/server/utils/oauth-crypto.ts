import type { H3Event } from 'h3'
import { sha256Base64Url, sha256Hex as moduleKitSha256Hex, timingSafeEqual } from '@frigear-nu/module-kit/crypto'
import { randomToken } from '@frigear-nu/module-kit/id'

/** Random, URL-safe secret (codes, refresh tokens, client secrets): `bytes` random bytes as hex. */
export function generateSecret(bytes = 32): string {
  return randomToken(bytes, 'hex')
}

/** SHA-256 hex (`@frigear-nu/module-kit/crypto`). */
export function sha256Hex(value: string): Promise<string> {
  return moduleKitSha256Hex(value)
}

/** Constant-time string comparison (`timingSafeEqual` of `@frigear-nu/module-kit/crypto`). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(a, b)
}

/** PKCE S256: `BASE64URL(SHA256(verifier))`. */
export function computeCodeChallenge(verifier: string): Promise<string> {
  return sha256Base64Url(verifier)
}

export async function verifyCodeChallenge(verifier: string, challenge: string): Promise<boolean> {
  return safeEqual(await computeCodeChallenge(verifier), challenge)
}

/**
 * Client authentication data from the `Authorization: Basic` header (id and secret are form-urlencoded and split on
 * the *first* colon, RFC 6749 §2.3.1) or from the request body. The secret is empty when none was sent, which is what
 * public clients do. Whether that is acceptable depends on the application (see `authenticateClient`).
 */
export function readClientAuth(event: H3Event, body: Record<string, unknown> | undefined): { clientId: string, clientSecret: string, basic: boolean } | null {
  const header = getHeader(event, 'authorization')
  if (header?.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = atob(header.slice(6).trim())
      const index = decoded.indexOf(':')
      if (index === -1) return null
      const clientId = decodeURIComponent(decoded.slice(0, index).replace(/\+/g, ' '))
      if (!clientId) return null
      return {
        clientId,
        clientSecret: decodeURIComponent(decoded.slice(index + 1).replace(/\+/g, ' ')),
        basic: true,
      }
    }
    catch {
      return null
    }
  }
  const clientId = typeof body?.client_id === 'string' ? body.client_id : ''
  if (!clientId) return null
  return { clientId, clientSecret: typeof body?.client_secret === 'string' ? body.client_secret : '', basic: false }
}

/** Client credentials that include a secret, or `null`. Confidential clients only; see `readClientAuth`. */
export function readClientCredentials(event: H3Event, body: Record<string, unknown> | undefined): { clientId: string, clientSecret: string, basic: boolean } | null {
  const auth = readClientAuth(event, body)
  return auth?.clientSecret ? auth : null
}
