import { and, eq, isNull, lt } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { RefreshTokenPolicy } from '../../../types'
import { newId, refreshTokenExpiresAt, resolveRefreshTokenPolicy } from '../../utils'

type ApplicationRow = typeof schema.oauthApplications.$inferSelect

/** What decides the lifetime of an application's refresh tokens (configured clients carry theirs in the same fields). */
export type RefreshPolicySource = Pick<ApplicationRow, 'id' | 'refreshIdleTtl' | 'refreshMaxAge'>

/** The refresh-token policy of an application: its own values, else the global `refreshToken` option. */
export function getApplicationRefreshPolicy(application: Pick<RefreshPolicySource, 'refreshIdleTtl' | 'refreshMaxAge'>): RefreshTokenPolicy {
  return resolveRefreshTokenPolicy(application, getOAuthRefreshTokenPolicy())
}

export type AuthorizationGrant = {
  userId: number
  scope: string[]
  /** The versions of the database scopes in `scope` the user consented to (`null`: none, or before versions were kept). */
  scopeVersions: Record<string, number> | null
  nonce: string | null
  authTime: Date
}

/** Stores a single-use authorization code (only its hash) and returns the plain code for the redirect. */
export async function createAuthorizationCode(input: {
  application: Pick<ApplicationRow, 'id'>
  userId: number
  redirectUri: string
  scope: string[]
  scopeVersions?: Record<string, number> | null
  codeChallenge: string
  nonce?: string | null
}): Promise<string> {
  const code = generateSecret()
  await db.delete(schema.oauthAuthorizationCodes).where(lt(schema.oauthAuthorizationCodes.expiresAt, new Date()))
  await db.insert(schema.oauthAuthorizationCodes).values({
    codeHash: await sha256Hex(code),
    applicationId: input.application.id,
    userId: input.userId,
    redirectUri: input.redirectUri,
    scope: input.scope.join(' '),
    scopeVersions: input.scopeVersions ?? null,
    codeChallenge: input.codeChallenge,
    nonce: input.nonce ?? null,
    expiresAt: new Date(Date.now() + useOAuthConfig().codeTtl * 1000),
  })
  return code
}

/**
 * Redeems a code. It is consumed even when validation fails afterwards (a code is only ever valid for
 * one attempt). Returns a human readable `error` instead of throwing so the token endpoint can answer
 * with an OAuth error body.
 */
export async function exchangeAuthorizationCode(input: {
  code: string
  application: Pick<ApplicationRow, 'id'>
  redirectUri: string
  codeVerifier: string
}): Promise<{ grant: AuthorizationGrant } | { error: string }> {
  const [row] = await db.delete(schema.oauthAuthorizationCodes)
    .where(eq(schema.oauthAuthorizationCodes.codeHash, await sha256Hex(input.code)))
    .returning()
  if (!row) return { error: 'The authorization code is invalid or already used.' }
  if (row.applicationId !== input.application.id) return { error: 'The authorization code was issued to another application.' }
  if (row.expiresAt.getTime() < Date.now()) return { error: 'The authorization code has expired.' }
  if (row.redirectUri !== input.redirectUri) return { error: 'The redirect_uri does not match the authorization request.' }
  if (!(await verifyCodeChallenge(input.codeVerifier, row.codeChallenge))) return { error: 'The code_verifier does not match the code_challenge.' }
  return { grant: { userId: row.userId, scope: row.scope.split(' ').filter(Boolean), scopeVersions: row.scopeVersions ?? null, nonce: row.nonce, authTime: row.authTime } }
}

/**
 * Creates a refresh token; pass `familyId` when rotating so the chain stays together. It expires at
 * `min(now + idleTtl, authTime + maxAge)` under the application's policy (`expiresAt` overrides it). The policy is read
 * now, so a changed policy reaches existing sign-ins at their next refresh.
 */
export async function createRefreshToken(input: {
  application: RefreshPolicySource
  userId: number
  scope: string[]
  scopeVersions?: Record<string, number> | null
  authTime: Date
  familyId?: string
  expiresAt?: Date
}): Promise<{ token: string, id: string, familyId: string, expiresAt: Date }> {
  const token = generateSecret(48)
  const id = newId('rt')
  const familyId = input.familyId ?? newId('rtf')
  const expiresAt = input.expiresAt ?? refreshTokenExpiresAt(getApplicationRefreshPolicy(input.application), input.authTime)
  await db.insert(schema.oauthRefreshTokens).values({
    id,
    tokenHash: await sha256Hex(token),
    applicationId: input.application.id,
    userId: input.userId,
    scope: input.scope.join(' '),
    scopeVersions: input.scopeVersions ?? null,
    familyId,
    authTime: input.authTime,
    expiresAt,
  })
  return { token, id, familyId, expiresAt }
}

/** Revokes every live token of a refresh-token family. Returns whether anything was revoked. */
export async function revokeOAuthFamily(familyId: string): Promise<boolean> {
  const revoked = await db.update(schema.oauthRefreshTokens).set({ revokedAt: new Date() })
    .where(and(eq(schema.oauthRefreshTokens.familyId, familyId), isNull(schema.oauthRefreshTokens.revokedAt)))
    .returning({ id: schema.oauthRefreshTokens.id })
  return revoked.length > 0
}

/**
 * Exchanges a refresh token for a new one (rotation). Presenting a token that was already rotated or
 * revoked is treated as theft: the whole family is revoked.
 */
export async function rotateRefreshToken(input: {
  token: string
  application: RefreshPolicySource
}): Promise<{ grant: AuthorizationGrant, token: string, expiresAt: Date } | { error: string }> {
  const [row] = await db.select().from(schema.oauthRefreshTokens)
    .where(eq(schema.oauthRefreshTokens.tokenHash, await sha256Hex(input.token))).limit(1)
  if (!row || row.applicationId !== input.application.id) return { error: 'The refresh token is invalid.' }

  if (row.revokedAt || row.replacedBy) {
    await revokeOAuthFamily(row.familyId)
    await useNitroApp().hooks.callHook('oauth:token:revoked', { applicationId: row.applicationId, userId: row.userId, reason: 'reuse_detected' })
    return { error: 'The refresh token was already used or revoked.' }
  }
  if (row.expiresAt.getTime() < Date.now()) return { error: 'The refresh token has expired.' }

  // The policy may have changed since this token was issued: a sign-in past its (new) `maxAge` ends here.
  const expiresAt = refreshTokenExpiresAt(getApplicationRefreshPolicy(input.application), row.authTime)
  if (expiresAt.getTime() <= Date.now()) return { error: 'The sign-in has expired; sign in again.' }

  const scope = row.scope.split(' ').filter(Boolean)
  const scopeVersions = row.scopeVersions ?? null
  const next = await createRefreshToken({ application: input.application, userId: row.userId, scope, scopeVersions, authTime: row.authTime, familyId: row.familyId, expiresAt })
  // Only one concurrent request may win the rotation; the loser is a reuse.
  const claimed = await db.update(schema.oauthRefreshTokens)
    .set({ replacedBy: next.id, revokedAt: new Date() })
    .where(and(eq(schema.oauthRefreshTokens.id, row.id), isNull(schema.oauthRefreshTokens.replacedBy), isNull(schema.oauthRefreshTokens.revokedAt)))
    .returning({ id: schema.oauthRefreshTokens.id })
  if (!claimed.length) {
    await revokeOAuthFamily(row.familyId)
    return { error: 'The refresh token was already used or revoked.' }
  }
  return { grant: { userId: row.userId, scope, scopeVersions, nonce: null, authTime: row.authTime }, token: next.token, expiresAt: next.expiresAt }
}

/** Revokes the family of a refresh token (RFC 7009). Unknown tokens are ignored. */
export async function revokeRefreshToken(token: string, applicationId: string): Promise<void> {
  const [row] = await db.select().from(schema.oauthRefreshTokens)
    .where(eq(schema.oauthRefreshTokens.tokenHash, await sha256Hex(token))).limit(1)
  if (!row || row.applicationId !== applicationId) return
  await revokeOAuthFamily(row.familyId)
  await useNitroApp().hooks.callHook('oauth:token:revoked', { applicationId, userId: row.userId, reason: 'revoked' })
}
