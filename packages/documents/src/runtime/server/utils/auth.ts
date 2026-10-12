import type { H3Event } from 'h3'
import type { AuthorizeContext } from '../../../types'

async function askManager(event: H3Event, userId: number): Promise<boolean> {
  const ctx: AuthorizeContext = { event, userId, allowed: false }
  await useNitroApp().hooks.callHook('documents:authorize', ctx)
  return ctx.allowed
}

/**
 * Gate for the admin routes. The host app decides through the `documents:authorize` Nitro hook.
 * Denied by default:
 *
 *     nitroApp.hooks.hook('documents:authorize', (ctx) => { ctx.allowed = isStaff(ctx.userId) })
 */
export async function requireDocumentsManager(event: H3Event): Promise<{ userId: number }> {
  const { user } = await requireUserSession(event)
  if (!await askManager(event, user.id)) throw createError({ statusCode: 403, statusMessage: 'You are not allowed to manage documents.' })
  return { userId: user.id }
}

/** The signed-in user and whether they manage documents (managers see everything). */
export async function requireDocumentsViewer(event: H3Event): Promise<{ userId: number, manager: boolean }> {
  const { user } = await requireUserSession(event)
  return { userId: user.id, manager: await askManager(event, user.id) }
}
