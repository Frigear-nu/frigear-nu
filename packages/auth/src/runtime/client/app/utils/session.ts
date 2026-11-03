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
}

export interface SessionMapper {
  /**
   * Puts stored tokens into the shared state and resolves; the mapping runs in the background. `force` maps the user
   * again and drops the cached userinfo (`useUserSession().fetch()`). `wait` resolves once the user is mapped and
   * rejects when the mapping failed for a reason other than being offline or signed out.
   */
  apply: (tokens: OAuthTokens | null, options?: { force?: boolean, wait?: boolean }) => Promise<void>
}

// Claims every refreshed id_token renews: a change in them alone is not new claims.
const VOLATILE_CLAIMS = new Set(['iat', 'exp', 'nbf', 'nonce', 'at_hash', 'jti', 'auth_time'])
const claimsKey = (claims: IdTokenClaims) => JSON.stringify(Object.keys(claims).sort()
  .filter(key => !VOLATILE_CLAIMS.has(key)).map(key => [key, claims[key]]))

/** The default mapping over the claims and, with `userinfo`, the userinfo response (the id_token's `sub` wins). */
const defaultMapUser = (withUserinfo: boolean): AuthClientMapUser | null => withUserinfo
  ? async ({ claims, userinfo }) => mapClaimsToUser({ ...claims, ...(await userinfo()), sub: claims.sub }) as unknown as Record<string, unknown>
  : null

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

  const fail = (error: unknown) => void hooks.callHook('auth:user-failed', { error })

  async function run(current: number, claims: IdTokenClaims): Promise<void> {
    if (!mapUser) return
    let cached: Promise<UserInfo> | undefined
    const context: AuthClientUserContext = {
      claims,
      userinfo: () => (cached ??= client.fetchUserInfo()),
      api: options.api,
    }
    let mapped: Record<string, unknown>
    try {
      mapped = await mapUser(context)
      if (!mapped || typeof mapped !== 'object') throw new TypeError('`authentication.client.mapUser` must return an object.')
    }
    catch (error) {
      if (current !== version) return
      // Offline or a server error: the claims mapping stays.
      if (error instanceof OAuthTransientError) return fail(error)
      // The API refused the tokens: handled like a 401 of `$api`.
      if (error instanceof OAuthSessionError) {
        fail(error)
        await options.onUnauthorized()
        return
      }
      // A configuration error, a userinfo response about another user or a failing mapper: surface it.
      fail(error)
      throw error
    }
    // Signed out, another user or newer claims meanwhile: this result is stale.
    if (current !== version || !state.session.value) return
    const user = { id: claims.sub, sub: claims.sub, ...mapped } as unknown as User
    state.session.value = { ...state.session.value, user }
  }

  return {
    async apply(tokens, { force = false, wait = false } = {}) {
      const claims = claimsOf(tokens, expected)
      if (!tokens || !claims) {
        version++
        key = null
        state.status.value = 'signed-out'
        state.claims.value = null
        state.session.value = null
        if (tokens) {
          await client.signOutLocally('no_identity').catch(() => undefined)
          fail(new OAuthAuthorizationError('no_identity', 'The stored session has no id_token claims of this issuer and client.'))
        }
        return
      }
      const sessionId = sessionIdOf(tokens, claims)
      const previous = state.session.value
      const sameUser = !!previous && state.claims.value?.sub === claims.sub
      // A refresh that kept the claims changes nothing about the user (and keeps the cached userinfo).
      if (!force && sameUser && claimsKey(claims) === key) {
        state.claims.value = claims
        if (previous.id !== sessionId) state.session.value = { ...previous, id: sessionId }
        return
      }
      const current = ++version
      key = claimsKey(claims)
      state.claims.value = claims
      // The same user keeps the mapped user until the new mapping finishes; a new one starts from the claims.
      state.session.value = { id: sessionId, user: sameUser && mapUser ? previous.user : mapClaimsToUser(claims) }
      state.status.value = 'signed-in'
      const mapped = run(current, claims)
      if (wait) return mapped
      mapped.catch(options.onError)
    },
  }
}

// One session mapper per app, created by the client plugin (`useUserSession().fetch()` uses it).
const mappers = new WeakMap<object, SessionMapper>()
export const setSessionMapper = (nuxtApp: object, mapper: SessionMapper) => void mappers.set(nuxtApp, mapper)
export const getSessionMapper = (nuxtApp: object) => mappers.get(nuxtApp)
