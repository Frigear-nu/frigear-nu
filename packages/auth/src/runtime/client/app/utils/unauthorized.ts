import type { NuxtApp } from '#app'
import { navigateTo } from '#imports'
import type { OAuthClient } from '../../core/types'
import type { AuthClientPublicConfig } from '../../types'

/**
 * The API refused the tokens (a 401 a forced refresh did not fix). `onUnauthorized: 'signOut'` clears the local
 * session and sends the visitor to the login page, back here afterwards; `none` leaves it to the caller.
 */
export async function handleUnauthorized(nuxtApp: NuxtApp, client: Pick<OAuthClient, 'signOutLocally'>, config: AuthClientPublicConfig) {
  if (config.onUnauthorized !== 'signOut') return
  await client.signOutLocally('unauthorized')
  await nuxtApp.runWithContext(() => navigateTo({ path: config.redirect.login, query: { redirect: nuxtApp.$router.currentRoute.value.fullPath } }))
}
