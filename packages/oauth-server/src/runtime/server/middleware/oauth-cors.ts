// CORS for browser apps on another origin (e.g. a Capacitor webview), limited to the endpoints a public client calls.
// `/oauth/authorize` is deliberately absent: it is a top-level navigation and carries the user's cookie session.
// No `Access-Control-Allow-Credentials`, so cookies never travel cross-origin: bearer and client credentials only.
const METHODS: Record<string, string> = {
  '/oauth/token': 'POST, OPTIONS',
  '/oauth/revoke': 'POST, OPTIONS',
  '/oauth/userinfo': 'GET, OPTIONS',
  '/.well-known/openid-configuration': 'GET, OPTIONS',
  '/.well-known/jwks.json': 'GET, OPTIONS',
}

export default defineEventHandler((event) => {
  const methods = METHODS[getRequestURL(event).pathname]
  if (!methods) return

  // The response differs per origin, so caches must key on it (discovery is `public`).
  appendResponseHeader(event, 'Vary', 'Origin')

  const origin = getRequestHeader(event, 'origin')
  if (!origin || !getOAuthCorsOrigins().includes(origin)) return

  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '600',
  })

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }
})
