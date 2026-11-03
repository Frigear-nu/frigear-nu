import { computed, useNuxtApp } from '#imports'
import type { UserSessionComposable } from '#auth-utils'
import { applySession } from '../utils/session'
import { getAuthClientRuntime } from '../utils/runtime'
import { useAuthClientState } from '../utils/state'
import { useAuth } from './useAuth'

/**
 * Who is signed in, in client mode: nuxt-auth-utils' `useUserSession()` shape over the OAuth client. `loggedIn` is
 * `true` only with a `user`, which comes from the id_token claims.
 */
export function useUserSession(): UserSessionComposable {
  const nuxtApp = useNuxtApp()
  const state = useAuthClientState()
  const { logout } = useAuth()
  return {
    ready: computed(() => state.status.value !== 'unknown'),
    loggedIn: computed(() => state.status.value === 'signed-in' && !!state.session.value?.user),
    user: computed(() => state.session.value?.user ?? null),
    session: state.session,
    /** Re-reads the stored tokens and maps the user again. */
    async fetch() {
      if (import.meta.server) return
      const runtime = await getAuthClientRuntime()
      await applySession(state, nuxtApp, runtime.client, await runtime.client.getTokens().catch(() => null), runtime.identity)
    },
    /** Signs out without navigating (`useAuth().logout({ redirect: false })`). */
    clear: () => logout({ redirect: false }),
    openInPopup() {
      throw new Error('[@frigear-nu/auth] `openInPopup` is not available in client mode: use `useAuth().login()`.')
    },
  }
}
