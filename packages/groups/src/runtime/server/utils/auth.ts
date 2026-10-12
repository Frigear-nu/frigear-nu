import type { H3Event } from 'h3'
import type { AuthorizeContext } from '../../../types'

/**
 * Gate for the admin routes (groups and their members). The host app decides through the `groups:authorize`
 * Nitro hook. Denied by default:
 *
 *     nitroApp.hooks.hook('groups:authorize', (ctx) => { ctx.allowed = isStaff(ctx.userId) })
 */
export async function requireGroupsManager(event: H3Event): Promise<{ userId: number }> {
  const { user } = await requireUserSession(event)
  const ctx: AuthorizeContext = { event, userId: user.id, allowed: false }
  await useNitroApp().hooks.callHook('groups:authorize', ctx)
  if (!ctx.allowed) throw createError({ statusCode: 403, statusMessage: 'You are not allowed to manage groups.' })
  return { userId: user.id }
}
