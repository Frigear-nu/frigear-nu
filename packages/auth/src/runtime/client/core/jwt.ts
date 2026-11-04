import { OAuthAuthorizationError } from './errors'
import { base64urlDecode } from './pkce'
import type { IdTokenClaims } from './types'

/** The payload of a compact JWT, unverified. */
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) throw new OAuthAuthorizationError('invalid_id_token', 'The id_token is not a JWT.')
  try {
    const payload = JSON.parse(base64urlDecode(parts[1])) as unknown
    if (!payload || typeof payload !== 'object') throw new Error('not an object')
    return payload as T
  }
  catch (cause) {
    throw new OAuthAuthorizationError('invalid_id_token', 'The id_token payload is not valid JSON.', { cause })
  }
}

export interface IdTokenExpectations {
  /** Compared after `normalize` on both sides. */
  issuer: string
  clientId: string
  /** Epoch milliseconds. Without it `exp` is not checked against the clock. */
  now?: number
  toleranceSeconds?: number
  /** Required to match when set (the authorization code flow); unchecked on refresh. */
  nonce?: string
  /** Required to match when set (a refreshed id_token must be about the same user). */
  subject?: string
  normalizeIssuer?: (issuer: string) => string
}

/**
 * OpenID Connect Core §3.1.3.7 checks of an id_token received straight from the token endpoint over TLS: `iss`, `aud`
 * (and `azp` with several audiences), `sub`, `nonce` and, when `now` is given, `exp` (with `toleranceSeconds`,
 * default 120). The signature is not verified: for a token the client fetched itself from the issuer's token
 * endpoint, TLS server authentication stands in for it (§3.1.3.7 item 6). `iat` is not checked: a phone's clock that
 * runs ahead must not break sign-in.
 */
export function validateIdToken(token: string, expected: IdTokenExpectations): IdTokenClaims {
  const claims = decodeJwtPayload<IdTokenClaims>(token)
  const normalize = expected.normalizeIssuer ?? ((issuer: string) => issuer)
  const fail = (message: string) => new OAuthAuthorizationError('invalid_id_token', message)

  if (typeof claims.iss !== 'string' || normalize(claims.iss) !== normalize(expected.issuer)) {
    throw fail(`The id_token was issued by "${String(claims.iss)}", not "${expected.issuer}".`)
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audiences.includes(expected.clientId)) throw fail('The id_token is not meant for this client (aud).')
  if (audiences.length > 1 && claims.azp !== undefined && claims.azp !== expected.clientId) {
    throw fail('The id_token was issued to another client (azp).')
  }
  if (typeof claims.sub !== 'string' || !claims.sub) throw fail('The id_token has no subject.')
  if (expected.subject !== undefined && claims.sub !== expected.subject) throw fail('The id_token is about another user (sub).')
  if (typeof claims.exp !== 'number') throw fail('The id_token has no expiry.')
  if (expected.now !== undefined && claims.exp * 1000 + (expected.toleranceSeconds ?? 120) * 1000 <= expected.now) throw fail('The id_token has expired.')
  if (expected.nonce !== undefined && claims.nonce !== expected.nonce) throw fail('The id_token nonce does not match.')
  return claims
}
