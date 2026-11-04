import { createLocalJWKSet, errors, jwtVerify } from 'jose'
import type { JSONWebKeySet } from 'jose'
import type { AuthUser } from '@frigear-nu/auth/utils'
import type { OAuthResourceAccessToken, OAuthResourceRuntimeConfig, OAuthResourceUserinfo } from '../../../types'
import { parseList, resolveIssuerUrls } from '../../utils'

/** `runtimeConfig.oauthResource`, normalised: lists are arrays, `forceId` follows "Log in with frigear.nu" when unset. */
export function useOAuthResourceConfig() {
  const config = useRuntimeConfig()
  const resource = config.oauthResource as OAuthResourceRuntimeConfig
  const forceId = resource.forceId === '' || resource.forceId === undefined
    ? (config.frigear as { forceId?: boolean } | undefined)?.forceId === true
    : resource.forceId === true || String(resource.forceId) === 'true'
  return {
    ...resolveIssuerUrls(resource),
    audience: parseList(resource.audience),
    corsOrigins: parseList(resource.corsOrigins).filter(origin => origin !== '*'),
    corsPaths: parseList(resource.corsPaths),
    forceId,
    jwksCacheTtl: Number(resource.jwksCacheTtl) || 600,
  }
}

// The issuer's keys, shared by every request of this instance. A token with an unknown `kid` (the issuer rotated its
// key) refetches them, at most every `JWKS_REFETCH_COOLDOWN` ms, so garbage tokens cannot hammer the issuer.
const JWKS_REFETCH_COOLDOWN = 30_000
let jwksCache: { url: string, keys: ReturnType<typeof createLocalJWKSet>, fetchedAt: number } | undefined
let jwksPending: Promise<ReturnType<typeof createLocalJWKSet>> | undefined

async function getOAuthResourceJwks(url: string, maxAgeMs: number) {
  if (jwksCache?.url === url && Date.now() - jwksCache.fetchedAt < maxAgeMs) return jwksCache.keys
  jwksPending ??= $fetch<JSONWebKeySet>(url)
    .then((jwks) => {
      const keys = createLocalJWKSet(jwks)
      jwksCache = { url, keys, fetchedAt: Date.now() }
      return keys
    })
    .finally(() => {
      jwksPending = undefined
    })
  return jwksPending
}

/** Forgets the cached keys (tests, or after the issuer rotated). */
export function clearOAuthResourceJwksCache() {
  jwksCache = undefined
}

/**
 * Verifies an access token from the configured issuer: RS256 signature against the issuer's JWKS (cached), the `at+jwt` type, `iss`,
 * `aud` (the shared audience) and `exp`. Returns the claims, or `null` for anything that is not a valid token.
 */
export async function verifyOAuthResourceToken(token: string): Promise<OAuthResourceAccessToken | null> {
  const config = useOAuthResourceConfig()
  if (!config.audience.length) return null
  const verify = async (keys: ReturnType<typeof createLocalJWKSet>) => (await jwtVerify(token, keys, {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ['RS256'],
    typ: 'at+jwt',
    requiredClaims: ['sub', 'exp', 'client_id'],
  })).payload
  try {
    let payload
    try {
      payload = await verify(await getOAuthResourceJwks(config.jwksUrl, config.jwksCacheTtl * 1000))
    }
    catch (error) {
      if (!(error instanceof errors.JWKSNoMatchingKey)) throw error
      payload = await verify(await getOAuthResourceJwks(config.jwksUrl, JWKS_REFETCH_COOLDOWN))
    }
    if (typeof payload.sub !== 'string' || typeof payload.client_id !== 'string') return null
    return payload as OAuthResourceAccessToken
  }
  catch (error) {
    // Invalid tokens are a plain `null`; a failing issuer is worth a log line.
    if (!(error instanceof errors.JOSEError)) console.error('[oauth-resource] could not verify the access token', error)
    return null
  }
}

// Without `forceId` the issuer's user id has no column here: users are matched by email, read from userinfo once and
// remembered per instance.
const localIds = new Map<string, number>()
const LOCAL_ID_CACHE_SIZE = 5000

/**
 * The local user behind a verified token. With `forceId` the local id is `sub`; otherwise the user with the email
 * the issuer has for `sub`. A user seen for the first time is created from the issuer's userinfo (read with the token
 * itself, so it needs the `email` scope). Known users are not written to.
 */
export async function resolveOAuthResourceUser(token: string, payload: OAuthResourceAccessToken): Promise<AuthUser | null> {
  const { forceId } = useOAuthResourceConfig()
  if (forceId) {
    const id = Number(payload.sub)
    if (!Number.isSafeInteger(id) || id <= 0) return null
    return await loadAuthUser(id) ?? await provisionOAuthResourceUser(token, payload, true)
  }
  const known = localIds.get(payload.sub)
  const user = known !== undefined ? await loadAuthUser(known) : null
  return user ?? await provisionOAuthResourceUser(token, payload, false)
}

async function provisionOAuthResourceUser(token: string, payload: OAuthResourceAccessToken, forceId: boolean): Promise<AuthUser | null> {
  const profile = await fetchOAuthResourceUserinfo(token)
  if (!profile?.email || profile.sub !== payload.sub) return null

  let stored
  try {
    stored = await syncFrigearUser({
      id: forceId ? Number(payload.sub) : undefined,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      emailVerified: profile.email_verified,
    }, { forceId })
  }
  catch (error) {
    // Two first requests of the same user race to create them: the loser finds the winner's row.
    const users = useAuthUserStore()
    stored = forceId ? await users.findById(Number(payload.sub)) : await users.findByEmail(profile.email.trim().toLowerCase())
    if (!stored) {
      console.error('[oauth-resource] could not provision the user', error)
      return null
    }
  }

  if (!forceId) {
    if (localIds.size >= LOCAL_ID_CACHE_SIZE) localIds.delete(localIds.keys().next().value!)
    localIds.set(payload.sub, stored.id)
  }
  return loadAuthUser(stored.id)
}

async function fetchOAuthResourceUserinfo(token: string): Promise<OAuthResourceUserinfo | null> {
  try {
    return await $fetch<OAuthResourceUserinfo>(useOAuthResourceConfig().userinfoUrl, { headers: { authorization: `Bearer ${token}` } })
  }
  catch (error) {
    console.error('[oauth-resource] userinfo request failed', error)
    return null
  }
}
