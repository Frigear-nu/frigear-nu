import { $fetch, fetch } from '@nuxt/test-utils/e2e'

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ApiClientOptions = {
  /** A session cookie (`name=value`), sent as the `cookie` header. */
  cookie?: string
  /** An API or OAuth access token, sent as `authorization: Bearer <token>`. */
  bearer?: string
}

/**
 * A small HTTP client for e2e tests against the fixture started by `setup()` from `@nuxt/test-utils/e2e`, acting
 * as one caller (a session cookie, a bearer token, or anonymous).
 *
 * - `json(method, path, body?)` resolves with the parsed body of a 2xx response (`null` for 204) and rejects with
 *   the `FetchError` of any other status, so it pairs with `expectApiError`.
 * - `fetch(method, path, body?)` resolves with the raw `Response` whatever its status, for headers and statuses.
 *
 *     const staff = apiClient({ cookie })
 *     const event = await staff.json<EventDto>('POST', '/api/admin/events', { slug: 'party' })
 *     await expectApiError(apiClient().json('GET', '/api/admin/events'), 401)
 */
export function apiClient(options: ApiClientOptions = {}) {
  const headers = (body: unknown): Record<string, string> => ({
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
  })

  return {
    async json<T = unknown>(method: ApiMethod, path: string, body?: unknown): Promise<T> {
      const result = await $fetch<T>(path, { method, headers: headers(body), body: body as Record<string, unknown> | undefined })
      return (result ?? null) as T
    },
    fetch(method: ApiMethod, path: string, body?: unknown): Promise<Response> {
      return fetch(path, { method, headers: headers(body), body: body === undefined ? undefined : JSON.stringify(body) })
    },
  }
}

type ErrorBody = { statusCode?: number, status?: number, data?: { code?: unknown } & Record<string, unknown> }

const describeError = (value: unknown) => {
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

/**
 * Asserts that a request failed with `status` (and, when given, the toolkit's `data.code`). Takes the promise of
 * `apiClient().json(...)` (a rejected `FetchError`) or of `apiClient().fetch(...)` (a `Response` with that status).
 * Resolves with the error body for further assertions.
 *
 *     await expectApiError(api.json('DELETE', `/api/admin/events/${id}`), 403, 'forbidden')
 */
export async function expectApiError(promise: Promise<unknown>, status: number, code?: string): Promise<ErrorBody> {
  let actualStatus: number | undefined
  let body: ErrorBody | undefined
  try {
    const result = await promise
    if (!(result instanceof Response)) {
      throw new TypeError(`[module-kit] Expected the request to fail with ${status}, but it succeeded: ${describeError(result)}`)
    }
    actualStatus = result.status
    const text = await result.text()
    try {
      body = text ? JSON.parse(text) as ErrorBody : {}
    }
    catch {
      body = { data: { text } }
    }
  }
  catch (error) {
    if (error instanceof Error && error.message.startsWith('[module-kit] Expected')) throw error
    const fetchError = error as { statusCode?: number, status?: number, data?: unknown }
    actualStatus = fetchError.statusCode ?? fetchError.status
    body = (fetchError.data ?? {}) as ErrorBody
    if (actualStatus === undefined) throw error
  }
  if (actualStatus !== status) {
    throw new Error(`[module-kit] Expected status ${status}, got ${actualStatus}: ${describeError(body)}`)
  }
  if (code !== undefined && body?.data?.code !== code) {
    throw new Error(`[module-kit] Expected error code "${code}", got "${String(body?.data?.code)}": ${describeError(body)}`)
  }
  return body ?? {}
}
