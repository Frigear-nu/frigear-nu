import { $fetch, defineNuxtPlugin, navigateTo, useAuthPages, useRequestHeaders, useRequestURL, useRoute, useUserSession } from '#imports'
import { shouldForwardCredentials } from '../../utils/forward'

type FetchOptions = NonNullable<Parameters<typeof $fetch>[1]>
type Context = { request: RequestInfo | URL, options: { baseURL?: string, headers?: HeadersInit }, response?: Response }
type Hook = (context: Context) => void | Promise<void>

/** `$fetch` for the app's own API, with the caller's credentials on this origin only. */
export type AuthApi = <T = unknown>(request: string | URL | Request, options?: FetchOptions) => Promise<T>

const urlOf = (request: RequestInfo | URL) => typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
const isAbsolute = (value: string) => /^[a-z][a-z\d+.-]*:/i.test(value.trim()) || value.trim().startsWith('//')
const toPath = (value: string) => {
  const url = new URL(value.trim())
  return `${url.pathname}${url.search}${url.hash}`
}
const hooksOf = (hook: unknown): Hook[] => Array.isArray(hook) ? hook : hook ? [hook as Hook] : []

// `$api` in server mode. During a server render it sends the incoming Cookie and Authorization headers along, but
// only to this app's own URLs, and in-process: an own-origin URL (the origin comes from the Host header) becomes a
// path. Any other URL goes out without them. They are attached by the last `onRequest` hook, once the caller's own
// hooks settled where the request goes, and never replace headers the caller set. A 401 from this app while signed
// in ends the session here and goes to the login page, back afterwards.
export default defineNuxtPlugin({
  name: 'auth:api',
  setup(nuxtApp) {
    const origin = useRequestURL().origin
    // In the browser, the browser sends the cookies to this origin itself.
    const incoming = import.meta.server ? useRequestHeaders(['cookie', 'authorization']) : {}
    const { loggedIn, clear } = useUserSession()
    const isOwn = ({ request, options }: Context) =>
      shouldForwardCredentials(urlOf(request), typeof request === 'string' ? options.baseURL : undefined, origin)

    const attach: Hook = (context) => {
      if (!isOwn(context)) return
      const { request, options } = context
      if (import.meta.server && typeof request === 'string') {
        if (isAbsolute(request)) context.request = toPath(request)
        else if (options.baseURL && isAbsolute(options.baseURL)) options.baseURL = toPath(options.baseURL)
      }
      const headers = new Headers(options.headers)
      for (const [name, value] of Object.entries(incoming)) {
        if (value && !headers.has(name)) headers.set(name, value)
      }
      options.headers = headers
    }
    const onUnauthorized: Hook = async (context) => {
      if (context.response?.status !== 401 || !loggedIn.value || !isOwn(context)) return
      await nuxtApp.runWithContext(() => clear())
      await nuxtApp.runWithContext(() => {
        const { login } = useAuthPages()
        const { fullPath, path } = useRoute()
        if (/^https?:\/\//.test(login)) return navigateTo(login, { external: true })
        return navigateTo(path === login ? login : { path: login, query: { redirect: fullPath } })
      })
    }

    const api: AuthApi = <T>(request: string | URL | Request, options: FetchOptions = {}) => {
      const own = options as { onRequest?: unknown, onResponseError?: unknown }
      return ($fetch as unknown as <R>(request: string | URL | Request, options: object) => Promise<R>)<T>(request, {
        ...options,
        onRequest: [...hooksOf(own.onRequest), attach],
        onResponseError: [...hooksOf(own.onResponseError), onUnauthorized],
      })
    }
    return { provide: { api } }
  },
})
