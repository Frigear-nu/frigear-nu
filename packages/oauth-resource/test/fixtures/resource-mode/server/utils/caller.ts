import type { H3Event } from 'h3'
import type { Permission } from '@frigear-nu/auth/access'

/** Authorizes `permission` and answers who the caller is. */
export async function testCaller(event: H3Event, permission: Permission) {
  const principal = await authorize(event, permission)
  return { kind: principal.kind, userId: principal.user.id, email: principal.user.email, foreign: principal.foreign ?? false }
}
