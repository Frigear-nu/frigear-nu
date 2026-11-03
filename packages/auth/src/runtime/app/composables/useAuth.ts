import { computed, navigateTo, readonly, ref, useAuthPages, useNuxtApp, useUserSession } from '#imports'
import { authApi } from '../../utils/api'
import { isSafeRedirect } from '../../utils/redirect'

const isExternalUrl = (value: string) => /^https?:\/\//.test(value)

/**
 * The sign-in actions of the app (server mode), with the same contract as client mode's. Who is signed in comes from
 * `useUserSession()`. There is no OAuth client here: `getAccessToken()` is `null` (the cookie is the credential),
 * `completeLogin()` throws and `isCallbackUrl()` is `false`.
 */
export function useAuth() {
  // Captured now: the actions run after awaits, where the Nuxt context is gone during a server render.
  const nuxtApp = useNuxtApp()
  const { ready, loggedIn, clear } = useUserSession()
  const loginPage = useAuthPages().login

  return {
    status: computed(() => (!ready.value ? 'unknown' : loggedIn.value ? 'signed-in' : 'signed-out') as 'unknown' | 'signed-in' | 'signed-out'),
    authenticated: computed(() => loggedIn.value),
    /** Always `false`: signing in happens on the login page. */
    signingIn: readonly(ref(false)),

    /** Goes to the login page, which sends the user back to `returnTo` (a path on this site) afterwards. */
    async login(options: { returnTo?: string, params?: Record<string, string> } = {}) {
      const query = isSafeRedirect(options.returnTo) ? { redirect: options.returnTo } : undefined
      if (isExternalUrl(loginPage)) {
        const url = new URL(loginPage)
        if (query) url.searchParams.set('redirect', query.redirect)
        await nuxtApp.runWithContext(() => navigateTo(url.toString(), { external: true }))
        return
      }
      await nuxtApp.runWithContext(() => navigateTo({ path: loginPage, query }))
    },

    async completeLogin(_callbackUrl?: string): Promise<never> {
      throw new Error('[@frigear-nu/auth] `completeLogin` is client mode only: server mode signs in on the login page.')
    },

    /** Ends the session (`POST /api/auth/logout`), clears it here and navigates to `/` (or `redirect`; `false` stays). */
    async logout(options: { redirect?: boolean | string } = {}) {
      // Through `$api`, so a server render forwards the session cookie to the logout route.
      await (nuxtApp.$api as (request: string, options: object) => Promise<unknown>)(authApi.logout, { method: 'POST' })
      await nuxtApp.runWithContext(() => clear())
      const target = typeof options.redirect === 'string' && isSafeRedirect(options.redirect) ? options.redirect : '/'
      if (options.redirect !== false) await nuxtApp.runWithContext(() => navigateTo(target))
    },

    /** Always `null`: in server mode the session cookie is the credential. */
    async getAccessToken(_options?: { forceRefresh?: boolean, ifCurrent?: string }): Promise<string | null> {
      return null
    },

    /** Always `false`: there are no OAuth callbacks to leave alone. */
    isCallbackUrl(_url: string): boolean {
      return false
    },
  }
}
