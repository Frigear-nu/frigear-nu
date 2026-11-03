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
