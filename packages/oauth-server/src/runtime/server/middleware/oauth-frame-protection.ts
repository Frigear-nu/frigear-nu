// The consent page and the OAuth endpoints are never meant to be framed: refuse it, so the approval cannot be clickjacked.
export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname
  if (pathname !== useOAuthConfig().authorizePath && !pathname.startsWith('/oauth/')) return
  setResponseHeader(event, 'Content-Security-Policy', 'frame-ancestors \'none\'')
  setResponseHeader(event, 'X-Frame-Options', 'DENY')
})
