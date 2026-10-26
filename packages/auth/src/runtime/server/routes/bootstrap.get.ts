import { providers } from '#bootstrap/providers'

/**
 * `GET /api/_bootstrap?scope=<scope>`: the signed-in user's data for an area in one request. Authenticates once, then
 * runs the scope's providers (`registerBootstrapProvider`) side by side on this event and returns `{ [key]: data }`.
 * A provider that fails (e.g. a token without its scope) is left out, so the client falls back to that module's own
 * endpoint for it; the rest still load.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const scope = getQuery(event).scope
  if (typeof scope !== 'string' || !scope) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'The `scope` query parameter is required.' })
  }
  const list = Object.hasOwn(providers, scope) ? providers[scope] : undefined
  if (!list?.length) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `Unknown bootstrap scope "${scope}".` })

  setResponseHeader(event, 'cache-control', 'private, no-store')

  const settled = await Promise.allSettled(list.map(async provider => provider.handler(event)))
  const data: Record<string, unknown> = {}
  settled.forEach((result, index) => {
    const { key } = list[index]!
    if (result.status === 'fulfilled') {
      if (result.value !== undefined) data[key] = result.value
      return
    }
    const reason = result.reason as { statusCode?: number, message?: string } | undefined
    // An expected refusal (missing scope, not allowed) is not an incident; anything else is.
    if (reason?.statusCode && reason.statusCode < 500) console.warn(`[auth] bootstrap provider "${key}" (${scope}) skipped: ${reason.statusCode} ${reason.message ?? ''}`.trim())
    else console.error(`[auth] bootstrap provider "${key}" (${scope}) failed:`, result.reason)
  })
  return data
})
