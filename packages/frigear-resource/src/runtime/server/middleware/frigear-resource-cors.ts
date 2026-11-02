import { matchesPathPrefix } from '../../utils'

// Bearer-only CORS for the mobile app's webview (and other configured origins) on the service's API. No
// `Access-Control-Allow-Credentials`, so cookies never travel cross-origin: a cross-origin caller is always a bearer token.
export default defineEventHandler((event) => {
  const config = useFrigearResourceConfig()
  if (!matchesPathPrefix(getRequestURL(event).pathname, config.corsPaths)) return

  // The response differs per origin, so caches must key on it.
  appendResponseHeader(event, 'Vary', 'Origin')

  const origin = getRequestHeader(event, 'origin')
  if (!origin || !config.corsOrigins.includes(origin)) return

  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, accept',
    'Access-Control-Expose-Headers': 'www-authenticate',
    'Access-Control-Max-Age': '600',
  })

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }
})
