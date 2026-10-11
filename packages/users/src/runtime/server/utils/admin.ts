import type { H3Event } from 'h3'
import { schema } from '@nuxthub/db'
import { getTableColumns } from 'drizzle-orm'

export type UsersAdminAction = 'view' | 'create' | 'update'

export type UsersAdminContext = {
  event: H3Event
  /** The signed-in user making the request. */
  userId: number
  action: UsersAdminAction
  /** `create`/`update`: the values being written (`role` only when an authorization module added the column). */
  input?: { role?: string, email?: string, name?: string }
  /** `update`: the user being changed, as stored. */
  target?: { id: number, email: string, role?: string }
  /** Set to `true` to allow. Denied by default. */
  allowed: boolean
}

/** Whether another module added a `role` column to `users` (`@frigear-nu/authorization`). */
export const usersHaveRoles = () => 'role' in getTableColumns(schema.users)

/**
 * Asks the host (the `users:admin:authorize` hook) whether the signed-in user may do `action`; throws 401/403
 * otherwise. The users module knows nothing about roles or staff: that policy is the host's.
 */
export async function authorizeUsersAdmin(event: H3Event, action: UsersAdminAction, details: Pick<UsersAdminContext, 'input' | 'target'> = {}) {
  const { user } = await requireUserSession(event)
  const context: UsersAdminContext = { event, userId: user.id as number, action, ...details, allowed: false }
  await useNitroApp().hooks.callHook('users:admin:authorize', context)
  if (!context.allowed) {
    throw createError({ statusCode: 403, statusMessage: 'You are not allowed to manage users.' })
  }
  return user
}
