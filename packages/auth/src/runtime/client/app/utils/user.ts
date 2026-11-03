import type { User } from '#auth-utils'
import type { IdTokenClaims, OAuthTokens } from '../../core/types'
import { decodeJwtPayload } from '../../core/jwt'

/** Who a stored session must be about: tokens of another issuer or client (the config changed) are not ours. */
export interface ExpectedIdentity {
  issuer: string
  clientId: string
  /** Compares issuers after this on both sides (the loopback rewrite on a device). */
  normalizeIssuer?: (issuer: string) => string
}

/**
 * The claims of the stored id_token (validated when it was received), or `null` when there is none, it is unreadable,
 * has no subject, or names another issuer or audience than `expected`.
 */
export const claimsOf = (tokens: OAuthTokens | null, expected?: ExpectedIdentity): IdTokenClaims | null => {
  if (!tokens?.idToken) return null
  let claims: IdTokenClaims
  try {
    claims = decodeJwtPayload<IdTokenClaims>(tokens.idToken)
  }
  catch {
    return null
  }
  if (typeof claims.sub !== 'string' || !claims.sub) return null
  if (expected) {
    const normalize = expected.normalizeIssuer ?? ((issuer: string) => issuer.replace(/\/+$/, ''))
    if (typeof claims.iss !== 'string' || normalize(claims.iss) !== normalize(expected.issuer)) return null
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (!audiences.includes(expected.clientId)) return null
  }
  return claims
}

/**
 * The default user of client mode, from the id_token claims only, so it needs no request (a cold start offline still
 * knows who is signed in). `role` only when the token carries a string `role` claim.
 */
export function mapClaimsToUser(claims: IdTokenClaims): User {
  const user: Record<string, unknown> = { id: claims.sub, sub: claims.sub }
  if (typeof claims.name === 'string') user.name = claims.name
  if (typeof claims.email === 'string') user.email = claims.email
  if (typeof claims.picture === 'string') user.avatar = claims.picture
  if (typeof claims.role === 'string') user.role = claims.role
  return user as User
}

/** The session id: the sign-in's own id, or (tokens stored before it existed) the subject and sign-in time. */
export const sessionIdOf = (tokens: OAuthTokens, claims: IdTokenClaims): string =>
  tokens.sessionId ?? `${claims.sub}:${claims.auth_time ?? claims.iat ?? ''}`
