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
