import { computed, navigateTo, readonly, useRuntimeConfig } from '#imports'
import { isCallbackUrlFor } from '../../core/urls'
import type { CallbackResult, GetAccessTokenOptions, OAuthClient } from '../../core/types'
import { isNativePlatform } from '../../capacitor/adapters'
import { resolveRedirectUri, safeReturnTo } from '../../utils'
import { getOAuthRuntime } from '../utils/runtime'
import { useOAuthState } from '../utils/state'

/**
 * The sign-in state and actions of the app. Tokens live in the browser (or the device's Keychain), so on the server
 * `status` is `unknown` and the actions are not available.
 */
export function useOAuth() {
  const state = useOAuthState()
  const config = useRuntimeConfig().public.oauthClient
  const onSigningIn = (value: boolean) => (state.signingIn.value = value)
  const runtime = () => getOAuthRuntime(onSigningIn)

  return {
    status: readonly(state.status),
    authenticated: computed(() => state.status.value === 'signed-in'),
    /** The id_token claims (`sub`, `name`, `email`, ...) of the signed-in user. */
    claims: readonly(state.claims),
    /** From `login()` until the browser came back or was closed. */
    signingIn: readonly(state.signingIn),

    /** Starts a sign-in: redirects (browser) or opens the in-app browser (native app). */
    async login(options: { returnTo?: string, params?: Record<string, string> } = {}) {
      const { flow } = await runtime()
      await flow.login({ ...options, returnTo: safeReturnTo(options.returnTo) })
    },

    /** Completes a sign-in from the redirect URL (the callback page calls it with `window.location.href`). */
    async completeLogin(callbackUrl: string = globalThis.location.href): Promise<CallbackResult> {
      const { flow } = await runtime()
      const result = await flow.complete(callbackUrl)
      state.status.value = 'signed-in'
      return { ...result, returnTo: safeReturnTo(result.returnTo) ?? null }
    },

    /** Revokes the refresh token, clears the session and navigates to `redirect.afterLogout` (unless `redirect: false`). */
    async logout(options: { redirect?: boolean | string } = {}) {
      const { client } = await runtime()
      await client.logout()
      state.status.value = 'signed-out'
      state.claims.value = null
      if (options.redirect !== false) await navigateTo(typeof options.redirect === 'string' ? options.redirect : config.redirect.afterLogout)
    },

    /** A valid access token (refreshed when needed), or `null` when signed out or on the server. */
    async getAccessToken(options?: GetAccessTokenOptions): Promise<string | null> {
      if (import.meta.server) return null
      return (await runtime()).client.getAccessToken(options)
    },

    /** Whether `url` is an OAuth callback of this app (for deep-link routers, which must leave these alone). */
    isCallbackUrl(url: string): boolean {
      if (import.meta.server) return false
      const native = isNativePlatform()
      try {
        const redirectUri = resolveRedirectUri({
          native,
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

    /** The underlying framework-agnostic client (`@frigear-nu/oauth-client/core`). */
    async getClient(): Promise<OAuthClient> {
      return (await runtime()).client
    },
  }
}
