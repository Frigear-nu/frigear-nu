import type { H3Event } from 'h3'
import type { AuthPrincipal } from '@frigear-nu/auth/utils'

export async function canManageNotes(event: H3Event, principal: AuthPrincipal) {
  const ctx = { event, userId: principal.user.id, allowed: false }
  await useNitroApp().hooks.callHook('notes:authorize' as never, ctx as never)
  return ctx.allowed
}
