import { $fetch, defineNuxtPlugin, navigateTo } from '#imports'
import { createAuthorizedApi } from '../../utils/api'
import type { ApiRequest } from '../../utils/api'
import { getAuthClientRuntime, useAuthClientConfig } from '../utils/runtime'

type FetchOptions = NonNullable<Parameters<typeof $fetch>[1]>

/** `$fetch` against `apiBase` with the bearer token. */
export type AuthApi = <T = unknown>(request: string, options?: FetchOptions) => Promise<T>

// `$fetch` without Nitro's typed routes: `$api` mostly calls other servers.
const request$ = $fetch as unknown as ApiRequest

// `$api`: `$fetch` against `apiBase`, with the bearer token for the `apiOrigins` only. A 401 forces one refresh
// (unless another request already did) and retries once; an ended session signs out locally.
export default defineNuxtPlugin({
  name: 'auth-client:api',
  setup(nuxtApp) {
    const config = useAuthClientConfig()
    let authorized: AuthApi | undefined

    const api: AuthApi = async <T>(request: string, options: FetchOptions = {}): Promise<T> => {
      if (import.meta.server) {
        // No tokens on the server: the request goes out signed out.
        return request$<T>(request, { baseURL: config.apiBase || config.issuer, ...options } as Record<string, unknown>)
      }
      if (!authorized) {
        const runtime = await getAuthClientRuntime()
        authorized = createAuthorizedApi({
          client: runtime.client,
          request: request$,
          baseURL: runtime.apiBase,
          attachTo: config.apiOrigins.length ? config.apiOrigins.map(runtime.rewriteUrl) : [runtime.apiBase, runtime.rewriteUrl(config.issuer)],
          onUnauthorized: async () => {
            if (config.onUnauthorized !== 'signOut') return
            await runtime.client.signOutLocally('unauthorized')
            await nuxtApp.runWithContext(() => navigateTo({ path: config.redirect.login, query: { redirect: nuxtApp.$router.currentRoute.value.fullPath } }))
          },
        }) as AuthApi
      }
      return authorized<T>(request, options)
    }

    return { provide: { api } }
  },
})
