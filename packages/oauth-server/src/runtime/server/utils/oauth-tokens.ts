import { SignJWT, createLocalJWKSet, jwtVerify } from 'jose'
import type { H3Event } from 'h3'
import type { OAuthApplication, OAuthUser } from '../../../types'

type TokenInput = {
  event: H3Event
  user: OAuthUser
  application: OAuthApplication
  scope: string[]
  roles: string[]
}

async function sign(event: H3Event, application: OAuthApplication, userId: number, claims: Record<string, unknown>, options: { typ: string, ttl: number }) {
  const config = useOAuthConfig()
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', typ: options.typ, kid: config.keyId })
    .setIssuer(getOAuthIssuer(event))
    .setSubject(String(userId))
    .setAudience(application.id)
    .setIssuedAt()
    .setExpirationTime(`${options.ttl}s`)
    .setJti(crypto.randomUUID())
    .sign(await getSigningKey())
}

/** A bare access token (`sub`, `scope`, `client_id`) plus whatever `oauth:claims` adds. Header `typ` is `at+jwt`. */
export async function signAccessToken(input: TokenInput): Promise<string> {
  const claims = await buildClaims({ ...input, tokenType: 'access_token' })
  return sign(input.event, input.application, input.user.id, {
    ...claims,
    scope: input.scope.join(' '),
    client_id: input.application.id,
  }, { typ: 'at+jwt', ttl: useOAuthConfig().accessTokenTtl })
}

/** An OIDC ID token with the profile claims of the granted scopes, `nonce` and `auth_time`. */
export async function signIdToken(input: TokenInput & { nonce?: string | null, authTime: Date }): Promise<string> {
  const claims = await buildClaims({ ...input, tokenType: 'id_token' })
  return sign(input.event, input.application, input.user.id, {
    ...claims,
    auth_time: Math.floor(input.authTime.getTime() / 1000),
    ...(input.nonce ? { nonce: input.nonce } : {}),
  }, { typ: 'JWT', ttl: useOAuthConfig().accessTokenTtl })
}

export type AccessTokenPayload = { sub: string, aud: string, scope: string, client_id: string } & Record<string, unknown>

/** Verifies signature, expiry, issuer and the `at+jwt` type of an access token. Returns `null` when invalid. */
export async function verifyAccessToken(event: H3Event, token: string): Promise<AccessTokenPayload | null> {
  try {
    // Picks the key by `kid`, so tokens signed before a rotation verify until their key is dropped.
    const { payload } = await jwtVerify(token, createLocalJWKSet(await getJwks()), {
      issuer: getOAuthIssuer(event),
      algorithms: ['RS256'],
      typ: 'at+jwt',
    })
    if (typeof payload.sub !== 'string' || typeof payload.client_id !== 'string') return null
    return payload as unknown as AccessTokenPayload
  }
  catch {
    return null
  }
}
