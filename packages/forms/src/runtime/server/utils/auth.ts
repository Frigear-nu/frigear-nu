import type { H3Event } from 'h3'
import type { AuthorizeContext } from '../../../types'

/**
 * Gate for the admin routes (form definitions, submissions, files). This repo has no shared
 * permission system, so the host app decides through the `forms:authorize` Nitro hook.
 * Denied by default:
 *
 *     nitroApp.hooks.hook('forms:authorize', (ctx) => { ctx.allowed = isStaff(ctx.userId) })
 */
async function isFormsManager(event: H3Event, userId: number): Promise<boolean> {
  const ctx: AuthorizeContext = { event, userId, allowed: false }
  await useNitroApp().hooks.callHook('forms:authorize', ctx)
  return ctx.allowed
}

export async function requireFormsManager(event: H3Event): Promise<{ userId: number }> {
  const user = await requireUser(event, { scopes: ['forms:manage'] })
  if (!(await isFormsManager(event, user.id))) throw createError({ statusCode: 403, statusMessage: 'You are not allowed to manage forms.' })
  return { userId: user.id }
}

/** Non-throwing form of the `forms:authorize` policy for the caller of an already-authenticated request (MCP). */
export const canManageForms = (event: H3Event, principal: { user: { id: number } }) => isFormsManager(event, principal.user.id)
