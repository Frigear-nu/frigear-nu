import type { H3Event } from 'h3'
import type { AuthorizeContext } from '../../../types'

/**
 * Gate for the admin routes (form definitions, submissions, files). This repo has no shared
 * permission system, so the host app decides through the `forms:authorize` Nitro hook.
 * Denied by default:
 *
 *     nitroApp.hooks.hook('forms:authorize', (ctx) => { ctx.allowed = isStaff(ctx.userId) })
 */
export async function requireFormsManager(event: H3Event): Promise<{ userId: number }> {
  const { user } = await requireUserSession(event)
  const ctx: AuthorizeContext = { event, userId: user.id, allowed: false }
  await useNitroApp().hooks.callHook('forms:authorize', ctx)
  if (!ctx.allowed) throw createError({ statusCode: 403, statusMessage: 'You are not allowed to manage forms.' })
  return { userId: user.id }
}
