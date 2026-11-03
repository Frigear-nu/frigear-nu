import { $fetch, defineNuxtPlugin, useRequestFetch, useRequestURL } from '#imports'
import { shouldForwardCredentials } from '../../utils/forward'

type FetchOptions = NonNullable<Parameters<typeof $fetch>[1]>

/** `$fetch` for the app's own API, with the caller's credentials on this origin only. */
export type AuthApi = <T = unknown>(request: string, options?: FetchOptions) => Promise<T>

// `$api` in server mode: the request-aware fetch (during a server render it forwards the incoming Cookie and
// Authorization headers) for this app's own URLs only; any other URL goes through plain `$fetch`, without them.
export default defineNuxtPlugin({
  name: 'auth:api',
  setup() {
    const requestFetch = useRequestFetch() as unknown as AuthApi
    const origin = useRequestURL().origin
    const plain = $fetch as unknown as AuthApi
    const api: AuthApi = <T>(request: string, options: FetchOptions = {}) => {
      const baseURL = (options as { baseURL?: string }).baseURL
      return (shouldForwardCredentials(request, baseURL, origin) ? requestFetch : plain)<T>(request, options)
    }
    return { provide: { api } }
  },
})
