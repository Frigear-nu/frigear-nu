import { computed, navigateTo, readonly } from '#imports'
import { isCallbackUrlFor } from '../../core/urls'
import type { CallbackResult, GetAccessTokenOptions, OAuthClient } from '../../core/types'
import { isNativePlatform } from '../../capacitor/adapters'
import { resolveRedirectUri, safeReturnTo } from '../../utils'
import { isSafeRedirect } from '../../../utils/redirect'
import { getAuthClientRuntime, useAuthClientConfig } from '../utils/runtime'
import { useAuthClientState } from '../utils/state'

/**
 * The sign-in actions of the app (client mode). Who is signed in comes from `useUserSession()`. Tokens live in the
 * browser (or the device's Keychain), so on the server `status` is `unknown` and the actions are not available.
 */
export function useAuth() {
  const state = useAuthClientState()
  const config = useAuthClientConfig()
  const onSigningIn = (value: boolean) => (state.signingIn.value = value)
  const runtime = () => getAuthClientRuntime(onSigningIn)

  return {
    status: readonly(state.status),
    authenticated: computed(() => state.status.value === 'signed-in'),
    /** The id_token claims (`sub`, `name`, `email`, ...) of the signed-in user. Client mode only. */
    claims: readonly(state.claims),
    /** From `login()` until the browser came back or was closed. */
    signingIn: readonly(state.signingIn),

    /** Starts a sign-in: redirects (browser) or opens the in-app browser (native app). */
    async login(options: { returnTo?: string, params?: Record<string, string> } = {}) {
      const { flow } = await runtime()
      await flow.login({ ...options, returnTo: safeReturnTo(options.returnTo) })
    },

    /**
     * Completes a sign-in from the redirect URL (the callback page calls it with `window.location.href`). Rejects when
     * the response has no valid id_token; its tokens are discarded.
     */
    async completeLogin(callbackUrl: string = globalThis.location.href): Promise<CallbackResult> {
      const { flow } = await runtime()
      const result = await flow.complete(callbackUrl)
      return { ...result, returnTo: safeReturnTo(result.returnTo) ?? null }
    },

    /** Revokes the refresh token, clears the session and navigates to `redirect.afterLogout` (unless `redirect: false`). */
    async logout(options: { redirect?: boolean | string } = {}) {
      const { client } = await runtime()
      await client.logout()
      state.status.value = 'signed-out'
      state.claims.value = null
      state.session.value = null
      // Only to a path on this site (`isSafeRedirect`).
      const target = typeof options.redirect === 'string' && isSafeRedirect(options.redirect) ? options.redirect : config.redirect.afterLogout
      if (options.redirect !== false) await navigateTo(target)
    },

    /** A valid access token (refreshed when needed), or `null` when signed out or on the server. */
    async getAccessToken(options?: GetAccessTokenOptions): Promise<string | null> {
      if (import.meta.server) return null
      return (await runtime()).client.getAccessToken(options)
    },

    /** Whether `url` is an OAuth callback of this app (for deep-link routers, which must leave these alone). */
    isCallbackUrl(url: string): boolean {
      if (import.meta.server) return false
      try {
        const redirectUri = resolveRedirectUri({
          native: isNativePlatform(),
          origin: globalThis.location.origin,
          callbackPath: config.callbackPath,
          redirectUri: config.redirectUri,
          nativeRedirectUri: config.nativeRedirectUri,
        })
        return isCallbackUrlFor(redirectUri, url)
      }
      catch {
        return false
      }
    },

    /** The underlying framework-agnostic client (`@frigear-nu/auth/client-core`). Client mode only. */
    async getClient(): Promise<OAuthClient> {
      return (await runtime()).client
    },
  }
}
