import type { NuxtApp } from '#app'
import { OAuthAuthorizationError } from '../../core/errors'
import type { OAuthClient, OAuthTokens } from '../../core/types'
import { claimsOf, mapClaimsToUser, sessionIdOf } from './user'
import { useAuthClientState } from './state'

/**
 * Puts stored tokens into the shared state. A session without readable id_token claims (a corrupt store, another
 * issuer) is cleared locally and reported through `auth:user-failed`, so `loggedIn` always comes with a `user`.
 */
export function applySession(nuxtApp: NuxtApp, client: OAuthClient, tokens: OAuthTokens | null): void {
  const state = nuxtApp.runWithContext(() => useAuthClientState())
  const claims = claimsOf(tokens)
  if (!tokens || !claims) {
    state.status.value = 'signed-out'
    state.claims.value = null
    state.session.value = null
    if (tokens) {
      void client.signOutLocally('no_identity')
      void nuxtApp.callHook('auth:user-failed', { error: new OAuthAuthorizationError('no_identity', 'The stored session has no readable id_token claims.') })
    }
    return
  }
  state.claims.value = claims
  state.session.value = { id: sessionIdOf(tokens, claims), user: mapClaimsToUser(claims) }
  state.status.value = 'signed-in'
}
