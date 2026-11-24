import type { H3Event } from 'h3'
import { appendResponseHeader, getRequestHeader, setResponseHeaders, setResponseStatus } from 'h3'

export type BearerCorsOptions = {
  /**
   * Origins allowed to call: exact (`https://app.example.com`, `capacitor://localhost`), or a loopback IP on any port
   * (`http://127.0.0.1:*`, `http://[::1]:*`) for native apps whose local server picks a free port. `*` is ignored.
   */
  origins: readonly string[]
  /** `Access-Control-Allow-Methods`, e.g. `['GET', 'POST', 'OPTIONS']`. */
  methods: readonly string[] | string
  /** `Access-Control-Allow-Headers`. Defaults to `authorization, content-type`. */
  allowHeaders?: readonly string[] | string
  /** `Access-Control-Expose-Headers`, e.g. `www-authenticate`. None by default. */
  exposeHeaders?: readonly string[] | string
  /** `Access-Control-Max-Age` in seconds. Defaults to `600`. */
  maxAge?: number
}

const LOOPBACK_ANY_PORT = new Set(['http://127.0.0.1:*', 'http://[::1]:*'])

/**
 * Whether `origin` (a request's `Origin`) is one of `allowed`: an exact match, or `http://127.0.0.1:<port>` /
 * `http://[::1]:<port>` for the entry `http://127.0.0.1:*` / `http://[::1]:*`. Nothing else takes a wildcard.
 */
export function matchesCorsOrigin(origin: string, allowed: readonly string[]): boolean {
  if (!origin || origin === '*') return false
  if (allowed.includes(origin)) return true
  const match = /^(http:\/\/(?:127\.0\.0\.1|\[::1\])):([1-9]\d{0,4})$/.exec(origin)
  return !!match && Number(match[2]) <= 65535 && allowed.includes(`${match[1]}:*`)
}

/** Whether `entry` is a loopback origin on any port (`http://127.0.0.1:*`, `http://[::1]:*`). */
export function isLoopbackAnyPortOrigin(entry: string): boolean {
  return LOOPBACK_ANY_PORT.has(entry)
}

const headerList = (value: readonly string[] | string) => typeof value === 'string' ? value : value.join(', ')

/**
 * CORS for callers on another origin that authenticate with a bearer token (or client credentials), never a cookie:
 * there is no `Access-Control-Allow-Credentials`, so the browser never sends cookies cross-origin. Call it from a
 * middleware, only for the paths it covers. It always adds `Vary: Origin` (the response differs per origin), and the
 * CORS headers only for an allowed `Origin`. Returns `true` when it answered a preflight (`OPTIONS` from an allowed
 * origin, status 204): the middleware then ends the response.
 *
 *     export default defineEventHandler((event) => {
 *       if (!getRequestURL(event).pathname.startsWith('/api/')) return
 *       if (applyBearerCors(event, { origins, methods: ['GET', 'POST', 'OPTIONS'] })) return ''
 *     })
 */
export function applyBearerCors(event: H3Event, options: BearerCorsOptions): boolean {
  appendResponseHeader(event, 'Vary', 'Origin')

  const origin = getRequestHeader(event, 'origin')
  if (!origin || !matchesCorsOrigin(origin, options.origins)) return false

  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': headerList(options.methods),
    'Access-Control-Allow-Headers': headerList(options.allowHeaders ?? ['authorization', 'content-type']),
    ...(options.exposeHeaders ? { 'Access-Control-Expose-Headers': headerList(options.exposeHeaders) } : {}),
    'Access-Control-Max-Age': String(options.maxAge ?? 600),
  })

  if (event.method !== 'OPTIONS') return false
  setResponseStatus(event, 204)
  return true
}

/** Whether `pathname` falls under one of the `prefixes` (`/api/` matches `/api/x`, and `/api` itself). */
export function matchesPathPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(prefix => pathname === prefix.replace(/\/+$/, '') || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))
}
