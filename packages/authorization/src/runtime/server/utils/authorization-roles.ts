import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm'
import { isoDate } from '@frigear-nu/module-kit/server'
import type { AuthRoleSource, AuthUser } from '@frigear-nu/auth/utils'
import { registry } from '#auth/permissions'
import { table } from '#auth/roles'
import type { AuthorizationAssignedRoleDto, AuthorizationUserRolesDto } from '../../../types'
import type { StoredRole } from '../../utils/assignment'

// Storage of assigned roles (`authorization_user_roles`), shared by the role provider, the admin routes and the
// `users.role` migration. The table has no foreign key to `users`: call `deleteAuthorizationUserRoles` /
// `rekeyAuthorizationUserRoles` when a user is removed or re-keyed.

/** A stored role row. */
export interface AuthorizationUserRoleRow extends StoredRole {
  userId: number
  grantedBy: number | null
  createdAt: Date
}

const userRoles = () => schema.authorizationUserRoles
const meta = () => schema.authorizationMeta

/** Rows of the `users.role` migration go in batches, under sqlite's bound-variable limit. */
const INSERT_CHUNK = 100

/** The user's stored role rows (every source), oldest first. */
export async function listAuthorizationUserRoles(userId: number): Promise<AuthorizationUserRoleRow[]> {
  const rows = await db.select().from(userRoles()).where(eq(userRoles().userId, userId)).orderBy(userRoles().createdAt, userRoles().role)
  return rows as AuthorizationUserRoleRow[]
}

/**
 * Replaces the user's rows of one `source` with `roles` (the role provider's `setRoles`; single sign-on passes `sso`).
 * Rows of other sources are never touched: a role already stored under another source stays that row.
 */
export async function setAuthorizationUserRoles(userId: number, roles: readonly string[], options: { source: AuthRoleSource, grantedBy?: number | null }) {
  const wanted = [...new Set(roles.filter(role => typeof role === 'string' && role))]
  const current = await listAuthorizationUserRoles(userId)
  const stale = current.filter(row => row.source === options.source && !wanted.includes(row.role)).map(row => row.role)
  const stored = new Set(current.map(row => row.role))
  const added = wanted.filter(role => !stored.has(role))
  if (stale.length) {
    await db.delete(userRoles()).where(and(eq(userRoles().userId, userId), eq(userRoles().source, options.source), inArray(userRoles().role, stale)))
  }
  if (added.length) {
    await db.insert(userRoles())
      .values(added.map(role => ({ userId, role, source: options.source, grantedBy: options.grantedBy ?? null })))
      .onConflictDoNothing()
  }
}

/** Applies a planned assignment (`planRoleAssignment`): removes non-`sso` rows, adds `manual` rows. */
export async function applyAuthorizationRoleAssignment(userId: number, plan: { add: readonly string[], remove: readonly string[] }, grantedBy: number | null) {
  if (plan.remove.length) {
    await db.delete(userRoles()).where(and(eq(userRoles().userId, userId), ne(userRoles().source, 'sso'), inArray(userRoles().role, [...plan.remove])))
  }
  if (plan.add.length) {
    await db.insert(userRoles())
      .values(plan.add.map(role => ({ userId, role, source: 'manual' as const, grantedBy })))
      .onConflictDoNothing()
  }
}

/** Removes every role row of a user. Call it when the user is deleted (the table has no foreign key). */
export async function deleteAuthorizationUserRoles(userId: number) {
  await db.delete(userRoles()).where(eq(userRoles().userId, userId))
}

/** The statement that points a user's role rows at a new id (`AuthUserStore.changeId`). Pass a transaction as `executor`. */
export function rekeyAuthorizationUserRoles(from: number, to: number, executor: Pick<typeof db, 'update'> = db) {
  return executor.update(userRoles()).set({ userId: to }).where(eq(userRoles().userId, from))
}

/** How many users have an assigned row, per role. */
export async function countAuthorizationRoleUsers(): Promise<Map<string, number>> {
  const rows = await db.select({ role: userRoles().role, total: count() }).from(userRoles()).groupBy(userRoles().role)
  return new Map(rows.map(row => [row.role, Number(row.total)]))
}

export function toAuthorizationAssignedRoleDto(row: AuthorizationUserRoleRow): AuthorizationAssignedRoleDto {
  return {
    role: row.role,
    source: row.source,
    grantedBy: row.grantedBy ?? null,
    assignedAt: isoDate(row.createdAt),
    known: Object.hasOwn(table.roles, row.role),
  }
}

/**
 * The roles admin view of a user: stored rows, effective roles and the permissions they hold. `assignable` is what the
 * caller may assign. Pass `event: undefined` right after a change, so nothing cached earlier in the request is reused.
 */
export async function toAuthorizationUserRolesDto(event: H3Event | undefined, user: AuthUser, assignable: string[]): Promise<AuthorizationUserRolesDto> {
  const userId = Number(user.id)
  const [rows, effective, permissions] = await Promise.all([
    listAuthorizationUserRoles(userId),
    getEffectiveRoles(event, user),
    getUserPermissions(event, user),
  ])
  return {
    userId,
    assigned: rows.map(toAuthorizationAssignedRoleDto),
    effective,
    permissions,
    assignable,
  }
}

/** The registry and role table auth compiled at build time. */
export function useAuthorizationAccessTables() {
  return { registry, table }
}

// ---------------------------------------------------------------------------------------------------------------------
// The `users.role` migration
// ---------------------------------------------------------------------------------------------------------------------

/** The `authorization_meta` key recording that `users.role` was copied. */
export const AUTHORIZATION_ROLE_MIGRATION_KEY = 'users-role-migrated'

export interface AuthorizationRoleMigrationResult {
  /** `true` when the marker was already set: nothing was read or copied. */
  skipped: boolean
  /** Rows copied into `authorization_user_roles`. */
  copied: number
  /** Stored role names (copied or already assigned) that are not configured: kept, ignored at runtime. */
  unknown: string[]
}

/**
 * Copies `users.role` (where it is not `'user'`, a default or an `auto` role) into `authorization_user_roles` with
 * source `migrated`, then records a marker in `authorization_meta`, so it never runs again: removing a migrated role
 * cannot bring it back. Idempotent and safe to run concurrently (`onConflictDoNothing`). `users.role` is never read
 * as a live fallback.
 */
export async function runAuthorizationRoleMigration(): Promise<AuthorizationRoleMigrationResult> {
  const [marker] = await db.select().from(meta()).where(eq(meta().key, AUTHORIZATION_ROLE_MIGRATION_KEY)).limit(1)
  if (marker) return { skipped: true, copied: 0, unknown: [] }

  const users = schema.users as typeof schema.users & { role?: typeof schema.users.name }
  let copied = 0
  if (users.role) {
    const rows = await db.select({ id: users.id, role: users.role }).from(users).where(and(sql`${users.role} is not null`, ne(users.role, 'user')))
    const held = (role: string) => table.defaultRoles.includes(role) || table.autoRoles.includes(role)
    const values = rows
      .filter(row => typeof row.role === 'string' && row.role.trim() && !held(row.role))
      .map(row => ({ userId: Number(row.id), role: row.role!.trim(), source: 'migrated' as const, grantedBy: null }))
    for (let index = 0; index < values.length; index += INSERT_CHUNK) {
      await db.insert(userRoles()).values(values.slice(index, index + INSERT_CHUNK)).onConflictDoNothing()
    }
    copied = values.length
  }
  await db.insert(meta()).values({ key: AUTHORIZATION_ROLE_MIGRATION_KEY, value: new Date().toISOString() }).onConflictDoNothing()
  return { skipped: false, copied, unknown: await unknownAuthorizationRoles() }
}

/** Stored role names that are not configured roles (kept, ignored at runtime). */
export async function unknownAuthorizationRoles(): Promise<string[]> {
  const rows = await db.selectDistinct({ role: userRoles().role }).from(userRoles())
  return rows.map(row => row.role).filter(role => !Object.hasOwn(table.roles, role)).sort()
}

let migration: Promise<void> | undefined

/**
 * Runs the `users.role` migration once per process (the marker makes later processes skip it) and warns about stored
 * roles that are not configured. A failure is logged and retried on the next call; until then users hold only what
 * is already stored (fail closed).
 */
export function ensureAuthorizationRoleMigration(): Promise<void> {
  migration ??= (async () => {
    const result = await runAuthorizationRoleMigration()
    if (!result.skipped && result.copied) console.info(`[authorization] copied ${result.copied} role(s) from users.role into authorization_user_roles.`)
    const unknown = result.skipped ? await unknownAuthorizationRoles() : result.unknown
    if (unknown.length) {
      console.warn(`[authorization] stored roles that are not configured are kept and ignored: ${unknown.join(', ')}. Add them to \`authorization.roles\` or remove them.`)
    }
  })().catch((error: unknown) => {
    migration = undefined
    console.error('[authorization] the users.role migration failed; it is retried on the next request', error)
  })
  return migration
}
