import { defineNuxtPlugin, navigateTo } from '#imports'
import { listenForCallbacks } from '../../capacitor/adapters'
import { safeReturnTo } from '../../utils'
import { mapUser, userinfo } from '#auth/client-user'
import { createSessionMapper, setSessionMapper } from '../utils/session'
import type { AuthApi } from './api'
import { handleUnauthorized } from '../utils/unauthorized'
import { getAuthClientRuntime, useAuthClientConfig } from '../utils/runtime'
import { useAuthClientState } from '../utils/state'

/** `getLaunchUrl()` returns the cold-start URL for the whole process, also after a webview reload. */
const LAUNCH_URL_KEY = 'auth-client:launch-url'

// Restores the signed-in state before any route middleware runs, keeps it in sync (refreshes, other tabs, the server
// ending the session) and, inside a native app, completes sign-ins from the redirect the OS hands the app.
export default defineNuxtPlugin({
  name: 'auth-client',
  async setup(nuxtApp) {
    const state = useAuthClientState()
    const config = useAuthClientConfig()

    let runtime
    try {
      runtime = await getAuthClientRuntime(value => (state.signingIn.value = value))
    }
    catch (error) {
      console.error('[@frigear-nu/auth] The OAuth client is not configured:', error)
      state.status.value = 'signed-out'
      return
    }
    const { client } = runtime
    const report = (error: unknown) => console.error('[@frigear-nu/auth] Mapping the signed-in user failed:', error)
    const mapper = createSessionMapper({
      state,
      hooks: nuxtApp,
      client,
      expected: runtime.identity,
      mapUser,
      userinfo,
      // `$api` is provided by the next plugin; it is only called once a mapping runs.
      api: (request, options) => (nuxtApp.$api as AuthApi)(request, options),
      onUnauthorized: () => handleUnauthorized(nuxtApp, client, config),
      // In the background a mapping error is logged; `useUserSession().fetch()` rejects with it.
      onError: report,
    })
    setSessionMapper(nuxtApp, mapper)
    const apply = (tokens: Parameters<typeof mapper.apply>[0], wait = false) => mapper.apply(tokens, { wait })

    // A restored session is not a sign-in: no `auth:signed-in`.
    await apply(await client.getTokens().catch(() => null))

    client.onChange((event) => {
      if (event.type === 'refresh-failed') {
        void nuxtApp.callHook('auth:refresh-failed', { error: event.error })
        return
      }
      // `auth:signed-in` gets the mapped user (the claims mapping when mapping failed).
      void apply(event.tokens, event.type === 'signed-in').catch(report).then(() => {
        if (event.type === 'signed-in' && state.session.value?.user && state.claims.value) {
          void nuxtApp.callHook('auth:signed-in', { user: state.session.value.user, claims: state.claims.value })
        }
      })
      if (event.type === 'signed-out') void nuxtApp.callHook('auth:signed-out', { reason: event.reason })
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
          // Anything that does not answer a sign-in we started (a forged or replayed link) is ignored outright: the
          // browser stays open and the real sign-in can still complete.
          if (!(await client.matchesPendingAuthorization(url).catch(() => false))) return
          try {
            const { returnTo } = await runtime.flow.complete(url)
            await nuxtApp.runWithContext(() => navigateTo(safeReturnTo(returnTo) ?? config.redirect.afterLogin, { replace: true }))
          }
          catch (error) {
            console.error('[@frigear-nu/auth] Sign-in failed:', error)
            await nuxtApp.runWithContext(() => navigateTo({ path: config.redirect.login, query: { error: 'sign-in' } }))
          }
        },
        launchUrlStore: {
          get: () => {
            try {
              return globalThis.sessionStorage.getItem(LAUNCH_URL_KEY)
            }
            catch {
              return null
            }
          },
          set: (url) => {
            try {
              globalThis.sessionStorage.setItem(LAUNCH_URL_KEY, url)
            }
            catch {
              // Not available: the pending check still makes a replay harmless.
            }
          },
        },
        // Back in the foreground: refresh a token that expired in the background before the first request needs it.
        onResume: async () => {
          if (state.status.value === 'signed-in') await client.getAccessToken().catch(() => null)
        },
      })
    }
  },
})
