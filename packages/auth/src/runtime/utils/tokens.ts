import { sha256Hex } from '@frigear-nu/module-kit/crypto'
import { randomToken } from '@frigear-nu/module-kit/id'

/** The default prefix of user API tokens; a host sets its own with `authentication.apiTokens.prefix`. */
export const USER_TOKEN_PREFIX = 'fnu_'

/** `lastUsedAt` is only written this often, so reads do not turn into writes. */
export const LAST_USED_THROTTLE_MS = 5 * 60 * 1000

/** SHA-256 hex. Unsalted on purpose: tokens are 256-bit random secrets, and lookups are by hash. */
export async function hashToken(token: string): Promise<string> {
  return sha256Hex(token)
}

/** A new random token (shown once) with what is stored: its hash and display fragments. */
export async function generateUserToken(prefix: string = USER_TOKEN_PREFIX) {
  const token = `${prefix}${randomToken(32)}`
  return { token, ...await describeToken(token, prefix) }
}

/** The only parts of a token that are persisted: its prefix and four characters after it are shown. The plaintext never is. */
export async function describeToken(token: string, prefix: string = USER_TOKEN_PREFIX) {
  return { tokenHash: await hashToken(token), prefix: token.slice(0, prefix.length + 4), last4: token.slice(-4) }
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
