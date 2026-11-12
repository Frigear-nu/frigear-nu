import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { desc, getTableColumns, inArray } from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'
import { intIdParams, notFound } from '@frigear-nu/module-kit/server'
import { principalHasScopes } from '@frigear-nu/auth/utils'

export type UsersAdminAction = 'view' | 'create' | 'update' | 'delete'

export type UsersAdminContext = {
  event: H3Event
  /** The signed-in user making the request. */
  userId: number
  action: UsersAdminAction
  /** `create`/`update`: the values being written (`role` only when an authorization module added the column). */
  input?: { role?: string, email?: string, name?: string }
  /**
   * `update`/`delete`: the user being changed, as stored. `emailVerifiedAt` is there so a host that grants roles by
   * email (an allowlist) can require a verified address, as it does at sign-in.
   */
  target?: { id: number, email: string, role?: string, emailVerifiedAt?: Date | null }
  /** Set to `true` to allow. Denied by default. */
  allowed: boolean
}

/** How a users admin route lets callers in. */
export type UsersAdminCallerOptions = {
  /**
   * `view` only: also accept API tokens and OAuth access tokens that carry these scopes (`users:read` for the
   * read-only routes). The host policy still runs against the token's user. Without it, a session is required.
   */
  scopes?: string[]
}

/** The scope that lets an API token or OAuth access token read the user directory. Staff only (see the module). */
export const USERS_READ_SCOPE = 'users:read'

/** The permission to create, change and delete users (role-based access control). Sessions only. */
export const USERS_MANAGE_PERMISSION = 'users:manage'

export type UsersAdminRolesContext = {
  event: H3Event
  /** The signed-in user making the request. */
  userId: number
  /** The roles this user may assign, in display order. Replace it to narrow or extend the default (roles already in use). */
  roles: string[]
}

/** Whether another module added a `role` column to `users` (`@frigear-nu/authorization`). */
export const usersHaveRoles = () => 'role' in getTableColumns(schema.users)

type UsersAdminGateExtra = Pick<UsersAdminContext, 'action' | 'input' | 'target'>

// The staff gate (`users:admin:authorize`): the role's permission decides by default (`users:read` to view,
// `users:manage` to change), the host adds conditions. `action`, `input` and `target` are merged into the hook context.
const usersViewGate = definePolicyGate<UsersAdminGateExtra>('users:admin:authorize', { permission: USERS_READ_SCOPE })
const usersManageGate = definePolicyGate<UsersAdminGateExtra>('users:admin:authorize', { permission: USERS_MANAGE_PERMISSION })
const usersAdminGate = {
  isAllowed: (event: H3Event, userId: number, extra: UsersAdminGateExtra) =>
    (extra.action === 'view' ? usersViewGate : usersManageGate).isAllowed(event, userId, extra),
  assert: (event: H3Event, userId: number, message: string, extra: UsersAdminGateExtra) =>
    (extra.action === 'view' ? usersViewGate : usersManageGate).assert(event, userId, message, extra),
}

const USERS_ADMIN_DENIED = 'You are not allowed to manage users.'

/** Whether the host policy lets `userId` view the users admin: who may hold `users:read`. */
export const isUsersAdminViewer = (event: H3Event, userId: number) => usersAdminGate.isAllowed(event, userId, { action: 'view' })

// Staff actions are never available to API tokens or OAuth access tokens, except reads that name their scopes.
const requireUsersAdminCaller = (event: H3Event, action: UsersAdminAction, options: UsersAdminCallerOptions) =>
  requireUser(event, action === 'view' && options.scopes?.length ? { scopes: options.scopes } : { sessionOnly: true })

/**
 * Whether the host policy allows the caller to do `action` (never throws on denial; 401 without a credential). A
 * bearer credential is allowed nothing beyond what `options.scopes` opens up.
 */
export async function isUsersAdminAllowed(event: H3Event, action: UsersAdminAction, details: Pick<UsersAdminContext, 'input' | 'target'> = {}, options: UsersAdminCallerOptions = {}) {
  const principal = await requireAuth(event)
  const user = principal.user
  const bearerAllowed = action === 'view' && !!options.scopes?.length && principalHasScopes(principal, options.scopes)
  if (principal.kind !== 'session' && !bearerAllowed) return { allowed: false, user }
  const allowed = await usersAdminGate.isAllowed(event, user.id as number, { action, ...details })
  return { allowed, user }
}

/**
 * Asks the host (the `users:admin:authorize` hook) whether the signed-in user may do `action`; throws 401/403
 * otherwise. The users module knows nothing about roles or staff: that policy is the host's.
 */
export async function authorizeUsersAdmin(event: H3Event, action: UsersAdminAction, details: Pick<UsersAdminContext, 'input' | 'target'> = {}, options: UsersAdminCallerOptions = {}) {
  const user = await requireUsersAdminCaller(event, action, options)
  await usersAdminGate.assert(event, user.id as number, USERS_ADMIN_DENIED, { action, ...details })
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

/** The policy view of a stored user: what the `users:admin:authorize` hook sees as `target`. */
export const usersAdminTargetInfo = (user: { id: number, email: string, emailVerifiedAt?: Date | null }) => ({
  id: user.id,
  email: user.email,
  role: usersHaveRoles() ? (user as { role?: string }).role : undefined,
  emailVerifiedAt: user.emailVerifiedAt ?? null,
})

/**
 * Loads the user a staff member is acting on (`/api/admin/users/:id/...`) and runs the users admin policy against
 * them (`view` for reads, `update` for changes). For routes added with `extendUsersAdmin`.
 *
 * `options.scopes` lets bearer credentials with those scopes in for `view` (see `UsersAdminCallerOptions`).
 *
 * Authorizes before it looks anything up: 401 without a session, 403 when the host denies `action` outright, then
 * 400 for a malformed id, 404 for an unknown user, and 403 again when the host denies `action` on this target.
 */
export async function loadUsersAdminTarget(event: H3Event, action: Exclude<UsersAdminAction, 'create'>, options: UsersAdminCallerOptions = {}) {
  await authorizeUsersAdmin(event, action, {}, options)
  const { id } = await getValidatedRouterParams(event, intIdParams().parse)

  const target = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) })
  if (!target) throw notFound('User not found.')
  const actor = await authorizeUsersAdmin(event, action, { target: usersAdminTargetInfo(target), input: {} }, options)
  return { actor, target }
}
