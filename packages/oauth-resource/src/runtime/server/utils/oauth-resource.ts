import { createLocalJWKSet, errors, jwtVerify } from 'jose'
import type { JSONWebKeySet } from 'jose'
import type { AuthUser } from '@frigear-nu/auth/utils'
import { expandScopes } from '@frigear-nu/auth/utils'
import { namedScopes, registry } from '#auth/permissions'
import type { OAuthResourceAccessToken, OAuthResourceIntrospection, OAuthResourceRuntimeConfig, OAuthResourceUserinfo } from '../../../types'
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
    introspection: resource.introspection?.clientId
      ? {
          endpoint: resource.introspection.endpoint || `${resolveIssuerUrls(resource).issuer}/oauth/introspect`,
          clientId: resource.introspection.clientId,
          clientSecret: resource.introspection.clientSecret ?? '',
          cacheTtl: Number(resource.introspection.cacheTtl) || 30,
        }
      : null,
  }
}

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')

// Introspection answers per token (its `jti`, or the token), until `cacheTtl` or the token's expiry.
const introspected = new Map<string, { permissions: string[] | null, until: number }>()
const INTROSPECTION_CACHE_SIZE = 5000

/**
 * What a foreign token may do: with `introspection` configured, the issuer's live answer (`null` when it says the
 * token is no longer active); otherwise the `permissions` claim the issuer froze in it; for a token without one (an
 * older issuer), its scopes expanded against this service's permissions.
 */
export async function resolveOAuthResourcePermissions(token: string, payload: OAuthResourceAccessToken, scopes: string[]): Promise<string[] | null> {
  // A malformed claim is no claim to fall back from: refuse the token.
  if (payload.permissions !== undefined && !isStringList(payload.permissions)) return null
  const { introspection } = useOAuthResourceConfig()
  if (introspection) {
    const key = typeof payload.jti === 'string' ? payload.jti : token
    const cached = introspected.get(key)
    if (cached && cached.until > Date.now()) return cached.permissions
    let answer: OAuthResourceIntrospection
    try {
      answer = await $fetch<OAuthResourceIntrospection>(introspection.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'authorization': `Basic ${btoa(`${encodeURIComponent(introspection.clientId)}:${encodeURIComponent(introspection.clientSecret)}`)}`,
        },
        body: new URLSearchParams({ token, token_type_hint: 'access_token' }).toString(),
      })
    }
    catch (error) {
      // Fail closed, uncached: the next request asks again.
      console.error('[oauth-resource] token introspection failed', error)
      return null
    }
    const permissions = answer?.active === true && answer.sub === payload.sub
      ? (isStringList(answer.permissions) ? answer.permissions : expandScopes(scopes, registry, namedScopes))
      : null
    if (introspected.size >= INTROSPECTION_CACHE_SIZE) introspected.delete(introspected.keys().next().value!)
    introspected.set(key, { permissions, until: Math.min(Date.now() + introspection.cacheTtl * 1000, payload.exp * 1000) })
    return permissions
  }
  if (isStringList(payload.permissions)) return payload.permissions
  return expandScopes(scopes, registry, namedScopes)
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
// With `forceId`: the subs whose local row (id == sub) was confirmed to be the same person, per instance.
const boundIds = new Set<string>()

function bindSub(sub: string, id?: number) {
  if (id !== undefined) {
    if (localIds.size >= LOCAL_ID_CACHE_SIZE) localIds.delete(localIds.keys().next().value!)
    localIds.set(sub, id)
    return
  }
  if (boundIds.size >= LOCAL_ID_CACHE_SIZE) boundIds.delete(boundIds.values().next().value!)
  boundIds.add(sub)
}

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
    const local = await loadAuthUser(id)
    if (!local) return provisionOAuthResourceUser(token, payload, true)
    if (boundIds.has(payload.sub)) return local
    // A local row with this id may be someone else (a local sign-up, a user from before `forceId`). On first sight
    // the issuer's email for `sub` has to be the row's email; the binding is then remembered.
    const profile = await fetchOAuthResourceUserinfo(token)
    if (!profile?.email || profile.sub !== payload.sub || profile.email.trim().toLowerCase() !== String(local.email ?? '').trim().toLowerCase()) {
      console.warn('[oauth-resource] user not resolved: the local account with this id has another email')
      return null
    }
    bindSub(payload.sub)
    return local
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
    // A refusal (an unverified email of an existing user, an id held by someone else) stays one.
    if ((error as { statusCode?: number }).statusCode) {
      console.warn('[oauth-resource] user not provisioned:', (error as { statusMessage?: string }).statusMessage)
      return null
    }
    // Two first requests of the same user race to create them: the loser finds the winner's row, which has to be
    // this user (same email), and is found by email only when the issuer verified it.
    const users = useAuthUserStore()
    const email = profile.email.trim().toLowerCase()
    const found = forceId ? await users.findById(Number(payload.sub)) : profile.email_verified === true ? await users.findByEmail(email) : null
    stored = found && found.email.trim().toLowerCase() === email ? found : null
    if (!stored) {
      console.error('[oauth-resource] could not provision the user', error)
      return null
    }
  }

  bindSub(payload.sub, forceId ? undefined : stored.id)
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
