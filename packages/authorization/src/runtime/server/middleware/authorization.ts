import { defineEventHandler, createError } from 'h3'
import { evaluateRule, normalizeRequestPath, resolveRule, splitResolvedUser } from '../../utils'
import { abilities } from '#authorization/abilities'
import resolveServerUser from '#authorization/server-resolver'
import { useRuntimeConfig } from '#imports'

// Applies `routeRules[...].authorization` to API requests. Pages are gated by the app route middleware,
// which also runs during SSR.
export default defineEventHandler(async (event) => {
  // Match the path the router dispatches on (`event.path`, percent-decoded by h3), never the raw URL: otherwise
  // `/api/%61dmin/users` skips the `/api/admin/**` rule and still reaches the `/api/admin/users` handler.
  const pathname = normalizeRequestPath(event.path)
  if (pathname === null) {
    if (/(?:^|\/)api(?:[/\\]|%2f|%5c|$)/i.test(event.path.split('?', 1)[0] ?? '')) {
      throw createError({ statusCode: 400, message: 'Invalid request path.' })
    }
    return
  }
  if (!pathname.startsWith('/api/')) return

  const config = useRuntimeConfig(event).public.authorization
  const rule = resolveRule(config?.routes, pathname, config?.exempt)
  if (!rule) return

  const { user, credential } = splitResolvedUser(await resolveServerUser(event))
  const response = await evaluateRule(rule, user, abilities, credential)
  if (!response.authorized) {
    throw createError({ statusCode: response.statusCode ?? 403, message: response.message })
  }
})
