import type { Ref } from 'vue'
import type { UserSession } from '#auth-utils'
import { OAuthAuthorizationError } from '../../core/errors'
import type { OAuthClient, OAuthTokens, IdTokenClaims } from '../../core/types'
import { claimsOf, mapClaimsToUser, sessionIdOf } from './user'
import type { ExpectedIdentity } from './user'
import type { AuthStatus } from '../../types'

export interface SessionState {
  status: Ref<AuthStatus>
  claims: Ref<IdTokenClaims | null>
  session: Ref<UserSession | null>
}

/** What `applySession` needs of the Nuxt app: its hooks. */
export interface SessionHooks {
  callHook: (name: 'auth:user-failed', ctx: { error: unknown }) => unknown
}

/**
 * Puts stored tokens into the shared state. A session without readable id_token claims for this issuer and client (a
 * corrupt store, a changed issuer) is cleared locally and reported through `auth:user-failed`, so `loggedIn` always
 * comes with a `user`. Resolves once such a session is gone.
 */
export async function applySession(
  state: SessionState,
  hooks: SessionHooks,
  client: Pick<OAuthClient, 'signOutLocally'>,
  tokens: OAuthTokens | null,
  expected: ExpectedIdentity,
): Promise<void> {
  const claims = claimsOf(tokens, expected)
  if (!tokens || !claims) {
    state.status.value = 'signed-out'
    state.claims.value = null
    state.session.value = null
    if (tokens) {
      await client.signOutLocally('no_identity').catch(() => undefined)
      void hooks.callHook('auth:user-failed', { error: new OAuthAuthorizationError('no_identity', 'The stored session has no id_token claims of this issuer and client.') })
    }
    return
  }
  state.claims.value = claims
  state.session.value = { id: sessionIdOf(tokens, claims), user: mapClaimsToUser(claims) }
  state.status.value = 'signed-in'
}
