import { isLinkScanner, isShortLinkSubject } from '../../../utils/codes'

// The public redirect: `GET /<path>/:code` and `GET /<path>/:code/:subject` (registered for every method, so HEAD is
// answered too). It only ever redirects to the URL stored on the link (302), never to anything in the request, and
// answers the same 404 for an unknown, expired or disabled code. HEAD requests and link scanners (mail gateways, chat
// previews) are redirected without being counted.
export default defineEventHandler(async (event) => {
  const method = event.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    setResponseHeader(event, 'allow', 'GET, HEAD')
    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
  }
  setResponseHeaders(event, {
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
  })

  const code = getRouterParam(event, 'code', { decode: true }) ?? ''
  const rawSubject = getRouterParam(event, 'subject', { decode: true })
  const link = await findShortLink(code)
  if (!link || !isShortLinkActive(link) || (rawSubject !== undefined && !isShortLinkSubject(rawSubject))) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  if (method === 'GET' && !isLinkScanner(getRequestHeader(event, 'user-agent'))) {
    await recordShortLinkClick(event, link, rawSubject ?? null)
  }
  return sendRedirect(event, link.url, 302)
})
