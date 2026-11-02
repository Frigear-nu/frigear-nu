import { createLocalJWKSet, errors, jwtVerify } from 'jose'
import type { JSONWebKeySet } from 'jose'
import type { AuthUser } from '@frigear-nu/auth/utils'
import type { FrigearAccessToken, FrigearResourceRuntimeConfig, FrigearUserinfo } from '../../../types'
import { parseList, resolveIssuerUrls } from '../../utils'

/** `runtimeConfig.frigearResource`, normalised: lists are arrays, `forceId` follows "Log in with frigear.nu" when unset. */
export function useFrigearResourceConfig() {
  const config = useRuntimeConfig()
  const resource = config.frigearResource as FrigearResourceRuntimeConfig
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

async function getFrigearJwks(url: string, maxAgeMs: number) {
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
export function clearFrigearJwksCache() {
  jwksCache = undefined
}

/**
 * Verifies a frigear.nu access token: RS256 signature against the issuer's JWKS (cached), the `at+jwt` type, `iss`,
 * `aud` (the shared audience) and `exp`. Returns the claims, or `null` for anything that is not a valid token.
 */
export async function verifyFrigearAccessToken(token: string): Promise<FrigearAccessToken | null> {
  const config = useFrigearResourceConfig()
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
      payload = await verify(await getFrigearJwks(config.jwksUrl, config.jwksCacheTtl * 1000))
    }
    catch (error) {
      if (!(error instanceof errors.JWKSNoMatchingKey)) throw error
      payload = await verify(await getFrigearJwks(config.jwksUrl, JWKS_REFETCH_COOLDOWN))
    }
    if (typeof payload.sub !== 'string' || typeof payload.client_id !== 'string') return null
    return payload as FrigearAccessToken
  }
  catch (error) {
    // Invalid tokens are a plain `null`; a failing issuer is worth a log line.
    if (!(error instanceof errors.JOSEError)) console.error('[frigear-resource] could not verify the access token', error)
    return null
  }
}

// Without `forceId` a frigear.nu id has no column here: users are matched by email, read from userinfo once and
// remembered per instance.
const localIds = new Map<string, number>()
const LOCAL_ID_CACHE_SIZE = 5000

/**
 * The local user behind a verified token. With `forceId` the local id is `sub`; otherwise the user with the email
 * frigear.nu has for `sub`. A user seen for the first time is created from the issuer's userinfo (read with the token
 * itself, so it needs the `email` scope). Known users are not written to.
 */
export async function resolveFrigearUser(token: string, payload: FrigearAccessToken): Promise<AuthUser | null> {
  const { forceId } = useFrigearResourceConfig()
  if (forceId) {
    const id = Number(payload.sub)
    if (!Number.isSafeInteger(id) || id <= 0) return null
    return await loadAuthUser(id) ?? await provisionFrigearUser(token, payload, true)
  }
  const known = localIds.get(payload.sub)
  const user = known !== undefined ? await loadAuthUser(known) : null
  return user ?? await provisionFrigearUser(token, payload, false)
}

async function provisionFrigearUser(token: string, payload: FrigearAccessToken, forceId: boolean): Promise<AuthUser | null> {
  const profile = await fetchFrigearUserinfo(token)
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
      console.error('[frigear-resource] could not provision the user', error)
      return null
    }
  }

  if (!forceId) {
    if (localIds.size >= LOCAL_ID_CACHE_SIZE) localIds.delete(localIds.keys().next().value!)
    localIds.set(payload.sub, stored.id)
  }
  return loadAuthUser(stored.id)
}

async function fetchFrigearUserinfo(token: string): Promise<FrigearUserinfo | null> {
  try {
    return await $fetch<FrigearUserinfo>(useFrigearResourceConfig().userinfoUrl, { headers: { authorization: `Bearer ${token}` } })
  }
  catch (error) {
    console.error('[frigear-resource] userinfo request failed', error)
    return null
  }
}
