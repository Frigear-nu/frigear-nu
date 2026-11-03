import type { Ref } from 'vue'
import type { User, UserSession } from '#auth-utils'
import { OAuthAuthorizationError, OAuthSessionError, OAuthTransientError } from '../../core/errors'
import type { AuthClientMapUser, AuthClientUserContext, IdTokenClaims, OAuthClient, OAuthTokens, UserInfo } from '../../core/types'
import { claimsOf, mapClaimsToUser, sessionIdOf } from './user'
import type { ExpectedIdentity } from './user'
import type { AuthStatus } from '../../types'

export interface SessionState {
  status: Ref<AuthStatus>
  claims: Ref<IdTokenClaims | null>
  session: Ref<UserSession | null>
}

/** What the session needs of the Nuxt app: its hooks. */
export interface SessionHooks {
  callHook: (name: 'auth:user-failed', ctx: { error: unknown }) => unknown
}

export interface SessionMapperOptions {
  state: SessionState
  hooks: SessionHooks
  client: Pick<OAuthClient, 'signOutLocally' | 'fetchUserInfo'>
  expected: ExpectedIdentity
  /** `authentication.client.mapUser`, or `null` for the default mapping. */
  mapUser: AuthClientMapUser | null
  /** `authentication.client.userinfo`: the default mapping merges `/userinfo` too. */
  userinfo: boolean
  api: AuthClientUserContext['api']
  /** The API refused the tokens (a 401 a refresh did not fix): the `onUnauthorized` handling of `$api`. */
  onUnauthorized: () => Promise<void> | void
  /** A mapping that runs in the background failed for a reason that must surface. */
  onError: (error: unknown) => void
  /** A mapping that takes longer fails as transient. Default 15 seconds. */
  timeoutMs?: number
}

export interface SessionMapper {
  /**
   * Puts stored tokens into the shared state and resolves with the session id it applied (`null` signed out); the
   * mapping runs in the background. `force` maps the user again and drops the cached userinfo
   * (`useUserSession().fetch()`). `wait` resolves once the user of this sign-in is mapped (following any newer run of
   * the same sign-in) and rejects when the mapping failed for a reason other than being offline or signed out.
   */
  apply: (tokens: OAuthTokens | null, options?: { force?: boolean, wait?: boolean }) => Promise<string | null>
}

// Claims every refreshed id_token renews: a change in them alone is not new claims.
const VOLATILE_CLAIMS = new Set(['iat', 'exp', 'nbf', 'nonce', 'at_hash', 'jti', 'auth_time'])
const claimsKey = (claims: IdTokenClaims) => JSON.stringify(Object.keys(claims).sort()
  .filter(key => !VOLATILE_CLAIMS.has(key)).map(key => [key, claims[key]]))

/** The default mapping over the claims and, with `userinfo`, the userinfo response (the id_token's `sub` wins). */
const defaultMapUser = (withUserinfo: boolean): AuthClientMapUser | null => withUserinfo
  ? async ({ claims, userinfo }) => mapClaimsToUser({ ...claims, ...(await userinfo()), sub: claims.sub }) as unknown as Record<string, unknown>
  : null

type Failure = 'transient' | 'unauthorized' | 'handled' | 'surface'

/** How a failed mapping is handled. `$api` errors are `FetchError`s: it already ran `onUnauthorized` on a 401. */
function classify(error: unknown): Failure {
  if (error instanceof OAuthTransientError) return 'transient'
  if (error instanceof OAuthSessionError) return 'unauthorized'
  if (error instanceof Error && error.name === 'FetchError') {
    const status = (error as { statusCode?: number, response?: { status?: number } }).statusCode
      ?? (error as { response?: { status?: number } }).response?.status
    if (status === undefined || status === 429 || status >= 500) return 'transient'
    if (status === 401) return 'handled'
  }
  return 'surface'
}

/**
 * The signed-in user of client mode. A session without id_token claims of this issuer and client (a corrupt store, a
 * changed issuer) is cleared and reported through `auth:user-failed`, so `loggedIn` always comes with a `user`.
 *
 * The user is the claims mapping at once, so `loggedIn` never waits on the network. A custom or userinfo mapping runs
 * after it and replaces it when it finishes. Each run carries a version, raised on every change of the session
 * (sign-in, another user, a refresh with new claims, sign-out, `force`): a result whose version is no longer current
 * is dropped. Userinfo is fetched once per version.
 */
export function createSessionMapper(options: SessionMapperOptions): SessionMapper {
  const { state, hooks, client, expected } = options
  const mapUser = options.mapUser ?? defaultMapUser(options.userinfo)
  let version = 0
  let key: string | null = null
  /** The run of the current version, so `wait` can follow a newer run of the same sign-in. */
  let latest: Promise<void> = Promise.resolve()

  const fail = (error: unknown) => void hooks.callHook('auth:user-failed', { error })
  /** Waits for the current run, and for any run that replaced it meanwhile; rejects with the last one's error. */
  async function settled() {
    for (let seen: Promise<void> | undefined; seen !== latest;) {
      seen = latest
      await seen
    }
  }
  const setUser = (mapped: Record<string, unknown>, claims: IdTokenClaims) => {
    // The issuer's subject is the identity, whatever the mapper returned.
    const user = { ...mapped, id: claims.sub, sub: claims.sub } as unknown as User
    state.session.value = { ...state.session.value!, user }
  }

  async function run(current: number, claims: IdTokenClaims): Promise<void> {
    if (!mapUser) return
    let cached: Promise<UserInfo> | undefined
    const context: AuthClientUserContext = {
      claims,
      // Bound to this sign-in's subject, whatever is stored by the time the response arrives.
      userinfo: () => (cached ??= client.fetchUserInfo({ subject: claims.sub })),
      api: options.api,
    }
    let mapped: Record<string, unknown>
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new OAuthTransientError('mapping_timeout', 'Mapping the signed-in user timed out.')), options.timeoutMs ?? 15_000)
    })
    try {
      mapped = await Promise.race([Promise.resolve().then(() => mapUser(context)), timeout])
      if (!mapped || typeof mapped !== 'object') throw new TypeError('`authentication.client.mapUser` must return an object.')
    }
    catch (error) {
      if (current !== version) return
      const failure = classify(error)
      fail(error)
      // Whatever failed, the user is the claims mapping of these claims, never a previous mapping's (a revoked role).
      setUser(mapClaimsToUser(claims) as unknown as Record<string, unknown>, claims)
      // Offline or a server error: the next refresh with these claims maps again.
      if (failure === 'transient') {
        key = null
        return
      }
      // The tokens were refused: handled like a 401 of `$api` (which already did, for its own requests).
      if (failure === 'unauthorized') await options.onUnauthorized()
      // A refusal, a configuration error, a userinfo response about another user or a failing mapper: surface it.
      throw error
    }
    finally {
      clearTimeout(timer)
    }
    // Signed out, another sign-in or newer claims meanwhile: this result is stale.
    if (current !== version || !state.session.value) return
    setUser(mapped, claims)
  }

  return {
    async apply(tokens, { force = false, wait = false } = {}) {
      const claims = claimsOf(tokens, expected)
      if (!tokens || !claims) {
        version++
        key = null
        latest = Promise.resolve()
        state.status.value = 'signed-out'
        state.claims.value = null
        state.session.value = null
        if (tokens) {
          await client.signOutLocally('no_identity').catch(() => undefined)
          fail(new OAuthAuthorizationError('no_identity', 'The stored session has no id_token claims of this issuer and client.'))
        }
        return null
      }
      const sessionId = sessionIdOf(tokens, claims)
      const previous = state.session.value
      // The same sign-in of the same user; a new sign-in always maps again, with a fresh userinfo.
      const sameSession = !!previous && previous.id === sessionId && state.claims.value?.sub === claims.sub
      // A refresh that kept the claims changes nothing about the user (and keeps the cached userinfo).
      if (!force && sameSession && claimsKey(claims) === key) {
        state.claims.value = claims
        if (wait) await settled()
        return sessionId
      }
      const current = ++version
      key = claimsKey(claims)
      state.claims.value = claims
      // The same sign-in keeps the mapped user until the new mapping finishes; a new one starts from the claims.
      state.session.value = { id: sessionId, user: sameSession && mapUser ? previous.user : mapClaimsToUser(claims) }
      state.status.value = 'signed-in'
      const mapped = run(current, claims)
      latest = mapped
      if (!wait) {
        mapped.catch(options.onError)
        return sessionId
      }
      await mapped
      // A refresh during the mapping (from its own requests) started a newer run of this sign-in: wait for it too.
      if (state.session.value?.id === sessionId) await settled()
      return sessionId
    },
  }
}

// One session mapper per app, created by the client plugin (`useUserSession().fetch()` uses it).
const mappers = new WeakMap<object, SessionMapper>()
export const setSessionMapper = (nuxtApp: object, mapper: SessionMapper) => void mappers.set(nuxtApp, mapper)
export const getSessionMapper = (nuxtApp: object) => mappers.get(nuxtApp)
