import type { User } from '#auth-utils'
import type { IdTokenClaims, OAuthTokens } from '../../core/types'
import { decodeJwtPayload } from '../../core/jwt'

/** The claims of the stored id_token (validated when it was received), or `null` when there is none or it is unreadable. */
export const claimsOf = (tokens: OAuthTokens | null): IdTokenClaims | null => {
  if (!tokens?.idToken) return null
  try {
    const claims = decodeJwtPayload<IdTokenClaims>(tokens.idToken)
    return typeof claims.sub === 'string' && claims.sub ? claims : null
  }
  catch {
    return null
  }
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
