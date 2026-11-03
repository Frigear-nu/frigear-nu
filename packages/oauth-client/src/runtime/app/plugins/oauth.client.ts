import { defineNuxtPlugin, navigateTo, useRuntimeConfig } from '#imports'
import { decodeJwtPayload } from '../../core/jwt'
import type { IdTokenClaims, OAuthTokens } from '../../core/types'
import { listenForCallbacks } from '../../capacitor/adapters'
import { safeReturnTo } from '../../utils'
import { getOAuthRuntime } from '../utils/runtime'
import { useOAuthState } from '../utils/state'

const claimsOf = (tokens: OAuthTokens | null): IdTokenClaims | null => {
  if (!tokens?.idToken) return null
  try {
    return decodeJwtPayload<IdTokenClaims>(tokens.idToken)
  }
  catch {
    return null
  }
}

// Restores the signed-in state before any route middleware runs, keeps it in sync (refreshes, other tabs, the server
// ending the session) and, inside a native app, completes sign-ins from the redirect the OS hands the app.
export default defineNuxtPlugin({
  name: 'oauth-client',
  async setup(nuxtApp) {
    const state = useOAuthState()
    const config = useRuntimeConfig().public.oauthClient

    let runtime
    try {
      runtime = await getOAuthRuntime(value => (state.signingIn.value = value))
    }
    catch (error) {
      console.error('[@frigear-nu/oauth-client] The OAuth client is not configured:', error)
      state.status.value = 'signed-out'
      return
    }
    const { client } = runtime

    const apply = (tokens: OAuthTokens | null) => {
      state.status.value = tokens ? 'signed-in' : 'signed-out'
      state.claims.value = claimsOf(tokens)
    }
    apply(await client.getTokens().catch(() => null))

    client.onChange((event) => {
      if (event.type === 'refresh-failed') {
        void nuxtApp.callHook('oauth:refresh-failed', { error: event.error })
        return
      }
      apply(event.tokens)
      if (event.type === 'signed-in') void nuxtApp.callHook('oauth:signed-in', { claims: state.claims.value })
      if (event.type === 'signed-out') void nuxtApp.callHook('oauth:signed-out', { reason: event.reason })
    })

    // Another tab signed in, refreshed or signed out (localStorage only fires this in the other tabs).
    if (!runtime.native) {
      window.addEventListener('storage', (event) => {
        if (event.key === runtime.tokensKey || event.key === null) void client.getTokens().then(apply, () => apply(null))
      })
    }

    if (runtime.native && runtime.app) {
      await listenForCallbacks(runtime.app, {
        isCallbackUrl: url => client.isCallbackUrl(url),
        onCallback: async (url) => {
          try {
            const { returnTo } = await runtime.flow.complete(url)
            await nuxtApp.runWithContext(() => navigateTo(safeReturnTo(returnTo) ?? config.redirect.afterLogin, { replace: true }))
          }
          catch (error) {
            console.error('[@frigear-nu/oauth-client] Sign-in failed:', error)
            await nuxtApp.runWithContext(() => navigateTo({ path: config.redirect.login, query: { error: 'sign-in' } }))
          }
        },
        // Back in the foreground: refresh a token that expired in the background before the first request needs it.
        onResume: async () => {
          if (state.status.value === 'signed-in') await client.getAccessToken().catch(() => null)
        },
      })
    }
  },
})
