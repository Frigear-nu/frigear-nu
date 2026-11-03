import { applyBearerCors } from '@frigear-nu/module-kit/server'
import { matchesPathPrefix } from '../../utils'

// Bearer-only CORS for the mobile app's webview (and other configured origins) on the service's API. No
// `Access-Control-Allow-Credentials`, so cookies never travel cross-origin: a cross-origin caller is always a bearer token.
export default defineEventHandler((event) => {
  const config = useOAuthResourceConfig()
  if (!matchesPathPrefix(getRequestURL(event).pathname, config.corsPaths)) return

  const preflight = applyBearerCors(event, {
    origins: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['authorization', 'content-type', 'accept'],
    exposeHeaders: ['www-authenticate'],
  })
  if (preflight) return ''
})
