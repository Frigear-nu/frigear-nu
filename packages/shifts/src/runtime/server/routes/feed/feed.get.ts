import { notFound } from '@frigear-nu/module-kit/server'

// A person's shifts as an iCal feed, for calendar apps. Public by design: the secret in the path is the credential
// (`feed/<token>` or `feed/<token>.ics`; the router does not match a suffix, so it is stripped here). An unknown or
// revoked secret is a 404. Published, non-cancelled shifts from 30 days ago onward. Never cached by shared caches.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const feed = await shiftsFeedFor(event, token)
  if (feed === undefined) throw notFound('Feed not found.')
  setResponseHeader(event, 'content-type', 'text/calendar; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'private, max-age=300')
  return feed
})
