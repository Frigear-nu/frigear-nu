import { $fetch, defineNuxtPlugin, navigateTo, useRuntimeConfig } from '#imports'
import type { FetchOptions } from 'ofetch'
import { shouldAttachToken } from '../../utils'
import { getOAuthRuntime } from '../utils/runtime'

// `$fetch` without Nitro's typed routes: `$api` mostly calls other servers.
const request$ = $fetch as unknown as <T>(request: string, options?: FetchOptions) => Promise<T>

/** `$fetch` against `apiBase` with the bearer token. */
export type OAuthApi = <T = unknown>(request: string, options?: FetchOptions) => Promise<T>

const statusOf = (error: unknown) => (error as { response?: { status?: number }, statusCode?: number })?.response?.status
  ?? (error as { statusCode?: number })?.statusCode

const withBearer = (options: FetchOptions, token: string | null): FetchOptions => {
  if (!token) return options
  const headers = new Headers(options.headers)
  headers.set('authorization', `Bearer ${token}`)
  return { ...options, headers }
}

// `$api`: `$fetch` against `apiBase`, with the bearer token for the `api.attachTo` origins only. A 401 forces one
// refresh (unless another request already did) and retries once; a second 401 ends the local session.
export default defineNuxtPlugin({
  name: 'oauth-client:api',
  setup(nuxtApp) {
    const config = useRuntimeConfig().public.oauthClient

    const api: OAuthApi = async <T>(request: string, options: FetchOptions = {}): Promise<T> => {
      if (import.meta.server) {
        // No tokens on the server: the request goes out signed out.
        return request$<T>(request, { baseURL: config.apiBase || config.issuer, ...options })
      }
      const runtime = await getOAuthRuntime()
      const baseURL = options.baseURL ?? runtime.apiBase
      const attachTo = config.api.attachTo.length ? config.api.attachTo.map(runtime.rewriteUrl) : [runtime.apiBase, runtime.rewriteUrl(config.issuer)]
      const token = shouldAttachToken(request, baseURL, attachTo) ? await runtime.client.getAccessToken() : null
      const send = (accessToken: string | null) => request$<T>(request, withBearer({ ...options, baseURL }, accessToken))

      try {
        return await send(token)
      }
      catch (error) {
        if (!token || statusOf(error) !== 401) throw error
        const next = await runtime.client.getAccessToken({ forceRefresh: true, ifCurrent: token }).catch(() => null)
        if (next && next !== token) {
          try {
            return await send(next)
          }
          catch (retryError) {
            if (statusOf(retryError) === 401) await unauthorized()
            throw retryError
          }
        }
        await unauthorized()
        throw error
      }
    }

    async function unauthorized() {
      if (config.api.onUnauthorized !== 'signOut') return
      const runtime = await getOAuthRuntime()
      await runtime.client.signOutLocally('unauthorized')
      await nuxtApp.runWithContext(() => navigateTo({ path: config.redirect.login, query: { redirect: nuxtApp.$router.currentRoute.value.fullPath } }))
    }

    return { provide: { api } }
  },
})
