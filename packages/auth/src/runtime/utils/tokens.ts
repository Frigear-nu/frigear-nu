export const USER_TOKEN_PREFIX = 'fnu_'

/** `lastUsedAt` is only written this often, so reads do not turn into writes. */
export const LAST_USED_THROTTLE_MS = 5 * 60 * 1000

const toHex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')

/** SHA-256 hex. Unsalted on purpose: tokens are 256-bit random secrets, and lookups are by hash. */
export async function hashToken(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

/** A new random token (shown once) with what is stored: its hash and display fragments. */
export async function generateUserToken() {
  const token = `${USER_TOKEN_PREFIX}${base64url(crypto.getRandomValues(new Uint8Array(32)))}`
  return { token, ...await describeToken(token) }
}

/** The only parts of a token that are persisted. The plaintext never is. */
export async function describeToken(token: string) {
  return { tokenHash: await hashToken(token), prefix: token.slice(0, 8), last4: token.slice(-4) }
}

/** Extracts the token of an `Authorization: Bearer <token>` header (scheme is case-insensitive). */
export function parseBearer(header: string | null | undefined): string | null {
  const match = /^bearer\s+(\S+)\s*$/i.exec(header?.trim() ?? '')
  return match?.[1] ?? null
}

export const looksLikeJwt = (token: string) => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)

export type TokenStatus = 'ok' | 'revoked' | 'expired'

export function tokenStatus(row: { revokedAt?: Date | null, expiresAt?: Date | null }, now: Date = new Date()): TokenStatus {
  if (row.revokedAt) return 'revoked'
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return 'expired'
  return 'ok'
}

export function shouldTouchLastUsed(lastUsedAt: Date | null | undefined, now: Date = new Date()): boolean {
  return !lastUsedAt || now.getTime() - lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS
}
