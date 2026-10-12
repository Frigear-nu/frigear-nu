import type { H3Event } from 'h3'
import type { AuthorizeContext } from '../../types'

/**
 * Gate for staff routes (event/ticket management, check-in). This repo has no shared permission
 * system, so the host app decides through the `events:authorize` Nitro hook. Denied by default:
 *
 *     nitroApp.hooks.hook('events:authorize', (ctx) => { ctx.allowed = isStaff(ctx.userId) })
 */
export async function requireEventsManager(event: H3Event): Promise<{ userId: number }> {
  const user = await requireUser(event, { scopes: ['events:manage'] })
  const ctx: AuthorizeContext = { event, userId: user.id, allowed: false }
  await useNitroApp().hooks.callHook('events:authorize', ctx)
  if (!ctx.allowed) throw createError({ statusCode: 403, statusMessage: 'You are not allowed to manage events.' })
  return { userId: user.id }
}
