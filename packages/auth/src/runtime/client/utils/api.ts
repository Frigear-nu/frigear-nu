import { shouldAttachToken } from '../core/urls'
import type { OAuthClient } from '../core/types'

/** The options `$api` reads itself; everything else is passed to `$fetch` as is. */
export interface ApiRequestOptions {
  baseURL?: string
  headers?: HeadersInit
  [option: string]: unknown
}

export type ApiRequest = <T>(request: string, options: ApiRequestOptions) => Promise<T>

export interface AuthorizedApiOptions {
  client: Pick<OAuthClient, 'getAccessToken'>
  /** `$fetch`. */
  request: ApiRequest
  baseURL: string
  /** Origins that get the bearer token. */
  attachTo: string[]
  /** The session is over (a 401 a forced refresh could not fix): e.g. sign out locally and go to the login page. */
  onUnauthorized: () => Promise<void> | void
}

const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status
  ?? (error as { statusCode?: number } | null)?.statusCode

const withBearer = (options: ApiRequestOptions, token: string | null): ApiRequestOptions => {
  if (!token) return options
  const headers = new Headers(options.headers)
  headers.set('authorization', `Bearer ${token}`)
  return { ...options, headers }
}

/**
 * `$api`: `$fetch` with the bearer token for `attachTo` origins only (relative requests resolve against the
 * `baseURL`, which a call can override). A 401 forces one refresh (`ifCurrent`, so parallel requests share it) and
 * retries once. Only an ended session (the refresh resolving `null`, or the retry answered 401 again) calls
 * `onUnauthorized`; a refresh that failed transiently (offline, server error) or for a configuration reason rejects
 * with that error and keeps the session.
 */
export function createAuthorizedApi({ client, request, baseURL: defaultBaseURL, attachTo, onUnauthorized }: AuthorizedApiOptions) {
  return async <T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> => {
    const baseURL = options.baseURL ?? defaultBaseURL
    const token = shouldAttachToken(url, baseURL, attachTo) ? await client.getAccessToken() : null
    const send = (accessToken: string | null) => request<T>(url, withBearer({ ...options, baseURL }, accessToken))

    try {
      return await send(token)
    }
    catch (error) {
      if (!token || statusOf(error) !== 401) throw error
      const next = await client.getAccessToken({ forceRefresh: true, ifCurrent: token })
      if (!next || next === token) {
        await onUnauthorized()
        throw error
      }
      try {
        return await send(next)
      }
      catch (retryError) {
        if (statusOf(retryError) === 401) await onUnauthorized()
        throw retryError
      }
    }
  }
}

export interface SameOriginTokenOptions {
  /** The app's own origin (`location.origin`). */
  origin: string
  /** The current access token (refreshed when expired), or `null` when signed out. */
  getAccessToken: () => Promise<string | null>
  /** Requests to leave alone whatever their origin, such as the issuer's (its token endpoint must never wait on a token). */
  skip?: (url: URL) => boolean
}

type Fetch = typeof globalThis.fetch

/**
 * Resource mode's `fetch`: a request to the app's own origin carries the bearer token, as a cookie session would, so
 * every `$fetch` / `useFetch` of every module reaches the app's server signed in (ofetch calls `globalThis.fetch` on
 * each request, while modules hold their own `$fetch` binding). A request that sets its own `authorization` header,
 * goes to another origin or is skipped is left alone; a token that cannot be read sends it signed out.
 */
export function withSameOriginToken(base: Fetch, { origin, getAccessToken, skip }: SameOriginTokenOptions): Fetch {
  return async (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    let url: URL
    try {
      url = new URL(href, origin)
    }
    catch {
      return base(input, init)
    }
    if (url.origin !== new URL(origin).origin || skip?.(url)) return base(input, init)
    const headers = new Headers(init?.headers ?? (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined))
    if (headers.has('authorization')) return base(input, init)
    const token = await getAccessToken().catch(() => null)
    if (!token) return base(input, init)
    headers.set('authorization', `Bearer ${token}`)
    return base(input, { ...init, headers })
  }
}

export interface RoutedApiOptions {
  /** The page's own URL (`location.href`): relative requests, and requests to its scheme and host, are the app's own. */
  page: string
  /** Where the app's `/api/` requests go instead (`runtime.apiBase`). */
  apiBase: string
  client: Pick<OAuthClient, 'getAccessToken'>
  /** Origins that get the bearer token (`runtime.apiAttachTo`). */
  attachTo: string[]
  /** As `createAuthorizedApi`'s: the session is over. */
  onUnauthorized: () => Promise<void> | void
}

/** A 401 carried through `createAuthorizedApi` as an error, so it refreshes once and retries. */
class UnauthorizedResponse extends Error {
  constructor(readonly response: Response) {
    super('Unauthorized')
  }
}

/** Whether `pathname` is the app's API: `/api` or below it. */
const isApiPath = (pathname: string) => pathname === '/api' || pathname.startsWith('/api/')

/**
 * Client mode's `fetch` with `routeApi`: the app has no server of its own (a Capacitor app is served from
 * `capacitor://localhost`), so its own `/api/` requests, the relative `$fetch` / `useFetch` of every module, go to
 * `apiBase` instead, with the bearer token as `$api` sends it (`createAuthorizedApi`: only to `attachTo` origins, one
 * forced refresh on a 401, then the response as it came). Compares scheme and host rather than `origin`, which is
 * `"null"` for a custom scheme. Requests elsewhere, `Request` objects and an `apiBase` on the page's own host are left
 * alone; a request that sets its own `authorization` header is routed without the token.
 */
export function withRoutedApi(base: Fetch, { page, apiBase, client, attachTo, onUnauthorized }: RoutedApiOptions): Fetch {
  let own: URL
  let target: URL
  try {
    own = new URL(page)
    target = new URL(apiBase)
  }
  catch {
    return base
  }
  const isOwn = (url: URL) => url.protocol === own.protocol && url.host === own.host
  if (isOwn(target)) return base
  const root = target.href.replace(/\/+$/, '')

  const authorized = createAuthorizedApi({
    client,
    attachTo,
    baseURL: root,
    onUnauthorized,
    request: async <T>(url: string, options: ApiRequestOptions) => {
      const { init, headers } = options as { init?: RequestInit, headers?: HeadersInit }
      const response = await base(url, { ...init, headers })
      if (response.status === 401) throw new UnauthorizedResponse(response)
      return response as T
    },
  })

  return async (input, init) => {
    if (typeof input !== 'string' && !(input instanceof URL)) return base(input, init)
    let url: URL
    try {
      url = new URL(input, own)
    }
    catch {
      return base(input, init)
    }
    if (!isOwn(url) || !isApiPath(url.pathname)) return base(input, init)
    const routed = `${root}${url.pathname}${url.search}`
    const headers = new Headers(init?.headers)
    if (headers.has('authorization')) return base(routed, init)
    try {
      return await authorized<Response>(routed, { init, headers })
    }
    catch (error) {
      if (error instanceof UnauthorizedResponse) return error.response
      throw error
    }
  }
}
