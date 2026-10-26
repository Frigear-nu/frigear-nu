import type { H3Event } from 'h3'

const encoder = new TextEncoder()

function toHex(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Random, URL-safe secret (codes, refresh tokens, client secrets). */
export function generateSecret(bytes = 32): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  let diff = left.length ^ right.length
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  return diff === 0
}

/** PKCE S256: `BASE64URL(SHA256(verifier))`. */
export async function computeCodeChallenge(verifier: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))))
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
