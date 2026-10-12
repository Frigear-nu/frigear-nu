import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { desc, getTableColumns, inArray } from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'

export type UsersAdminAction = 'view' | 'create' | 'update' | 'delete'

export type UsersAdminContext = {
  event: H3Event
  /** The signed-in user making the request. */
  userId: number
  action: UsersAdminAction
  /** `create`/`update`: the values being written (`role` only when an authorization module added the column). */
  input?: { role?: string, email?: string, name?: string }
  /** `update`/`delete`: the user being changed, as stored. */
  target?: { id: number, email: string, role?: string }
  /** Set to `true` to allow. Denied by default. */
  allowed: boolean
}

export type UsersAdminRolesContext = {
  event: H3Event
  /** The signed-in user making the request. */
  userId: number
  /** The roles this user may assign, in display order. Replace it to narrow or extend the default (roles already in use). */
  roles: string[]
}

/** Whether another module added a `role` column to `users` (`@frigear-nu/authorization`). */
export const usersHaveRoles = () => 'role' in getTableColumns(schema.users)

/** Whether the host policy allows the signed-in user to do `action` (never throws on denial). */
export async function isUsersAdminAllowed(event: H3Event, action: UsersAdminAction, details: Pick<UsersAdminContext, 'input' | 'target'> = {}) {
  const { user } = await requireUserSession(event)
  const context: UsersAdminContext = { event, userId: user.id as number, action, ...details, allowed: false }
  await useNitroApp().hooks.callHook('users:admin:authorize', context)
  return { allowed: context.allowed, user }
}

/**
 * Asks the host (the `users:admin:authorize` hook) whether the signed-in user may do `action`; throws 401/403
 * otherwise. The users module knows nothing about roles or staff: that policy is the host's.
 */
export async function authorizeUsersAdmin(event: H3Event, action: UsersAdminAction, details: Pick<UsersAdminContext, 'input' | 'target'> = {}) {
  const { allowed, user } = await isUsersAdminAllowed(event, action, details)
  if (!allowed) {
    throw createError({ statusCode: 403, statusMessage: 'You are not allowed to manage users.' })
  }
  return user
}

/**
 * The roles the signed-in user may assign. Defaults to the roles in use; the host narrows/extends it through the
 * `users:admin:roles` hook (e.g. from a role hierarchy and the acting user's own rank).
 */
export async function assignableRoles(event: H3Event, userId: number): Promise<string[]> {
  let roles: string[] = []
  if (usersHaveRoles()) {
    const columns = schema.users as typeof schema.users & { role: typeof schema.users.name }
    const rows = await db.selectDistinct({ role: columns.role }).from(schema.users)
    roles = rows.map(row => row.role).filter((role): role is string => !!role)
  }
  const context: UsersAdminRolesContext = { event, userId, roles }
  await useNitroApp().hooks.callHook('users:admin:roles', context)
  return [...new Set(context.roles)]
}

/** Latest subscription per user, when a subscriptions table is installed (`@frigear-nu/subscriptions`); else empty. */
export async function latestSubscriptions(userIds: number[]) {
  const result = new Map<number, { planKey: string | null, status: string }>()
  const table = (schema as unknown as Record<string, unknown>).subscriptions as
    | { userId: AnyColumn, createdAt: AnyColumn, planKey: AnyColumn, status: AnyColumn, endedAt: AnyColumn }
    | undefined
  if (!table || !userIds.length) return result
  const rows = await db.select({ userId: table.userId, planKey: table.planKey, status: table.status, endedAt: table.endedAt })
    .from(table as never).where(inArray(table.userId, userIds)).orderBy(desc(table.createdAt)) as
    { userId: number, planKey: string | null, status: string, endedAt: Date | null }[]
  // Rows are newest first: the first live one wins, else the newest of any state.
  for (const row of rows) {
    const live = !row.endedAt && ['active', 'trialing', 'past_due'].includes(row.status)
    const current = result.get(row.userId)
    if (!current || (live && !['active', 'trialing', 'past_due'].includes(current.status))) {
      result.set(row.userId, { planKey: row.planKey, status: row.status })
    }
  }
  return result
}

/** Emails a single-use sign-in link that also verifies the address. No-op without the magic links table. */
export async function sendVerificationLink(event: H3Event, user: { id: number, name: string, email: string }) {
  if (!schema.magicLinks) return false
  const link = await createMagicLink(event, { userId: user.id, redirectUrl: '/' })
  if (!link) return false
  await dispatchAuthEmail('verify-email', user.email, { name: user.name, url: link.url })
  return true
}
