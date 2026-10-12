import type { H3Event } from 'h3'
import type { AuthorizeContext } from '../../types'

async function isEventsManager(event: H3Event, userId: number): Promise<boolean> {
  const ctx: AuthorizeContext = { event, userId, allowed: false }
  await useNitroApp().hooks.callHook('events:authorize', ctx)
  return ctx.allowed
}

/**
 * Gate for staff routes (event/ticket management, check-in). This repo has no shared permission
 * system, so the host app decides through the `events:authorize` Nitro hook. Denied by default:
 *
 *     nitroApp.hooks.hook('events:authorize', (ctx) => { ctx.allowed = isStaff(ctx.userId) })
 */
export async function requireEventsManager(event: H3Event): Promise<{ userId: number }> {
  const user = await requireUser(event, { scopes: ['events:manage'] })
  if (!(await isEventsManager(event, user.id))) throw createError({ statusCode: 403, statusMessage: 'You are not allowed to manage events.' })
  return { userId: user.id }
}

/** Non-throwing form of the `events:authorize` policy for the caller of an already-authenticated request (MCP). */
export const canManageEvents = (event: H3Event, principal: { user: { id: number } }) => isEventsManager(event, principal.user.id)
