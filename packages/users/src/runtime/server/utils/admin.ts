import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { desc, inArray } from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'
import { forbidden, intIdParams, notFound } from '@frigear-nu/module-kit/server'
import type { AuthPrincipal, AuthUser } from '@frigear-nu/auth/utils'

/** What a staff member does in the users admin; each maps to one permission (`USERS_PERMISSIONS`). */
export type UsersAdminAction = 'view' | 'list' | 'create' | 'update' | 'delete' | 'manage'

/**
 * The permissions of the users admin, by action. `view` reads one user, `list` the directory (and the dashboard
 * numbers); `manage` covers what touches someone's sign-in: changing or verifying their email, emailing a sign-in link.
 */
export const USERS_PERMISSIONS = {
  view: 'users:read',
  list: 'users:list',
  create: 'users:create',
  update: 'users:update',
  delete: 'users:delete',
  manage: 'users:manage',
} as const satisfies Record<UsersAdminAction, `users:${string}`>

/** The permission to read one user (`GET /api/admin/users/:id` and the routes other modules add below it). */
export const USERS_READ_PERMISSION = USERS_PERMISSIONS.view

/** The permission for the actions that touch someone's sign-in (email, sign-in links). Sessions only. */
export const USERS_MANAGE_PERMISSION = USERS_PERMISSIONS.manage

/** A stored user, as `loadUsersAdminTarget` returns it. */
export type UsersAdminTarget = typeof schema.users.$inferSelect

export interface UsersAdminTargetOptions {
  /**
   * Authorize this permission instead of the action's own (`USERS_PERMISSIONS[action]`), for routes other modules add
   * below `/api/admin/users/:id/` (`subscriptions:manage`). The action still decides whether target protection applies:
   * every action but `view` is a write.
   */
  permission?: string
}

/**
 * Authorizes the caller for a users admin action (`USERS_PERMISSIONS[action]`, through `authorize`) and returns the
 * caller's user. Throws 401 `unauthorized`, or 403 `session_required` / `insufficient_scope` / `forbidden`.
 */
export async function authorizeUsersAdmin(event: H3Event, action: UsersAdminAction): Promise<AuthUser> {
  return (await authorize(event, USERS_PERMISSIONS[action])).user
}

/**
 * The permissions `targetId` holds that `actor` does not (empty when the actor holds them all, or acts on themselves).
 * The target's permissions are their roles' (assigned, default, `auto` and `authorization:roles`) plus `implicit`, as
 * `getUserPermissions` resolves them; sensitive ones count by name. The actor holds a permission through their roles or
 * the `authorization:before` hook. An unknown target holds nothing. Throws 403 `forbidden` when the target's roles
 * cannot be resolved (the role provider, an `authorization:roles` listener or a requirement threw): fail closed.
 */
export async function usersAdminTargetMissing(event: H3Event, actor: AuthUser, targetId: number): Promise<string[]> {
  if (String(actor.id) === String(targetId)) return []
  const target = await loadAuthUser(targetId)
  if (!target) return []
  // Fail closed: a target whose roles cannot be resolved would otherwise look like one who holds nothing.
  try {
    await getEffectiveRoles(event, target, { strict: true })
  }
  catch (error) {
    console.error(`[users] the roles of user ${targetId} could not be resolved, refusing to act on them`, error)
    throw forbidden('You cannot change this user right now: their roles could not be checked.')
  }
  const [targetHeld, actorHeld] = await Promise.all([
    getUserPermissions(event, target),
    getUserPermissions(event, actor),
  ])
  const held = new Set(actorHeld)
  const missing: string[] = []
  for (const permission of targetHeld) {
    if (held.has(permission)) continue
    // Not in the actor's roles: an `authorization:before` listener may still allow it to them.
    if (!(await subjectAllowed(event, actor, permission))) missing.push(permission)
  }
  return missing
}

/**
 * Target protection: staff may only change a user who holds no permission the staff member lacks, so a coordinator
 * cannot edit or delete an admin. Hard-coded, not a policy: no hook or policy can turn it off. Throws 403 `forbidden`.
 */
export async function assertUsersAdminTargetProtected(event: H3Event, actor: AuthUser, targetId: number): Promise<void> {
  const missing = await usersAdminTargetMissing(event, actor, targetId)
  if (missing.length) {
    throw forbidden('You cannot change a user who holds permissions you do not have.', { missing })
  }
}

/**
 * Loads the user a staff member acts on (`/api/admin/users/:id/...`) and authorizes the action against them. For the
 * module's own routes and the routes other modules add with `extendUsersAdmin`.
 *
 * Authorizes before it looks anything up: 401 / 403 when the caller may not do the action at all, then 400 for a
 * malformed id, 404 for an unknown user, 403 when a policy of the permission denies it on this user, and, for every
 * action but `view`, 403 `forbidden` when the target holds a permission the caller does not (target protection).
 */
export async function loadUsersAdminTarget(
  event: H3Event,
  action: Exclude<UsersAdminAction, 'create' | 'list'>,
  options: UsersAdminTargetOptions = {},
): Promise<{ actor: AuthUser, principal: AuthPrincipal, target: UsersAdminTarget }> {
  const permission = options.permission ?? USERS_PERMISSIONS[action]
  await authorize(event, permission)
  const { id } = await getValidatedRouterParams(event, intIdParams().parse)

  const target = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) })
  if (!target) throw notFound('User not found.')
  const principal = await authorize(event, permission, target)
  if (action !== 'view') await assertUsersAdminTargetProtected(event, principal.user, target.id)
  return { actor: principal.user, principal, target }
}

/** Whether the caller may do a write `action` to `target`: the permission (with its policies) and target protection. */
export async function canUsersAdminTarget(event: H3Event, action: Exclude<UsersAdminAction, 'view' | 'list' | 'create'>, target: UsersAdminTarget): Promise<boolean> {
  const principal = await getAuth(event)
  if (!principal || !(await allows(event, USERS_PERMISSIONS[action], target))) return false
  try {
    return !(await usersAdminTargetMissing(event, principal.user, target.id)).length
  }
  catch {
    // The target's roles could not be resolved: the write would be refused.
    return false
  }
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
