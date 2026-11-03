import { applyBearerCors, matchesPathPrefix } from '@frigear-nu/module-kit/server'
import { oidc } from '../../utils/api'

// CORS for browser apps on another origin (e.g. a Capacitor webview), limited to the endpoints a public client calls.
// `/oauth/authorize` is deliberately absent: it is a top-level navigation and carries the user's cookie session.
// No `Access-Control-Allow-Credentials`, so cookies never travel cross-origin: bearer and client credentials only.
const METHODS: Record<string, string> = {
  [oidc.token]: 'POST, OPTIONS',
  [oidc.revoke]: 'POST, OPTIONS',
  [oidc.userinfo]: 'GET, OPTIONS',
  [oidc.configuration]: 'GET, OPTIONS',
  [oidc.jwks]: 'GET, OPTIONS',
}

// `cors.paths`: the host's own API, called with the access tokens this server issues.
const API_CORS = {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['authorization', 'content-type', 'accept'],
  exposeHeaders: ['www-authenticate'],
}

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname
  const methods = METHODS[pathname]
  // Never the authorization endpoint, even when a configured prefix covers it.
  const api = !methods && pathname !== oidc.authorize && matchesPathPrefix(pathname, getOAuthCorsPaths())
  if (!methods && !api) return

  // `Vary: Origin` always: the response differs per origin, so caches must key on it (discovery is `public`).
  const preflight = applyBearerCors(event, { origins: getOAuthCorsOrigins(), ...(methods ? { methods } : API_CORS) })
  if (preflight) return ''
})
