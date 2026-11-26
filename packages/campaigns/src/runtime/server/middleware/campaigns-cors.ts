import { applyBearerCors } from '@frigear-nu/module-kit/server'

const SUBSCRIBE_PATH = /^\/api\/campaigns\/lists\/[^/]+\/subscribe\/?$/

// CORS for the subscribe route only, for the origins in `campaigns.corsOrigins` (`matchesCorsOrigin`): a signup on
// another site of the organisation can post to it from the browser. No credentials: cookies never travel cross-origin,
// and the route needs none. A plain HTML form post needs no CORS at all.
export default defineEventHandler((event) => {
  if (!SUBSCRIBE_PATH.test(getRequestURL(event).pathname)) return
  const origins = campaignsConfig(event).corsOrigins
  if (!origins?.length) return
  const preflight = applyBearerCors(event, { origins, methods: ['POST', 'OPTIONS'], allowHeaders: ['content-type', 'accept'] })
  if (preflight) return ''
})
