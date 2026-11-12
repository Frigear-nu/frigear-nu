import { holds } from '@frigear-nu/auth/utils'
import type { AuthRoleSource, PermissionRegistry, RoleTable } from '@frigear-nu/auth/utils'

// Role assignment and its escalation rule, framework-free so it is unit tested on its own. Hard-coded, not a policy:
// a host cannot override it.

/** A stored role row (`authorization_user_roles`). */
export interface StoredRole {
  role: string
  source: AuthRoleSource
}

export interface RoleAssignmentInput {
  table: RoleTable
  registry: PermissionRegistry
  /** The target user's stored rows. */
  current: readonly StoredRole[]
  /**
   * The roles the admin wants the user to hold through assignment. Rows from single sign-on (`sso`) are not the
   * admin's to change: they stay whatever this list says, and listing them adds nothing.
   */
  requested: readonly string[]
  /** What the acting user's roles hold (`rolePermissions` of their effective roles): grants, wildcards, implicit. */
  actorHeld: readonly string[]
}

export type RoleAssignmentPlan
  = | { ok: true, add: string[], remove: string[], next: string[] }
    | { ok: false, status: 400, code: 'unknown_role', role: string, message: string }
    | { ok: false, status: 409, code: 'role_not_assignable', role: string, message: string }
    | { ok: false, status: 403, code: 'forbidden', role: string, missing: string[], message: string }

/** The permissions of `role` (inheritance included) the actor does not hold. Unknown roles hold nothing. */
export function missingForRole(role: string, table: RoleTable, registry: PermissionRegistry, actorHeld: readonly string[]): string[] {
  const compiled = Object.hasOwn(table.roles, role) ? table.roles[role] : undefined
  return (compiled?.permissions ?? []).filter(permission => !holds(actorHeld, permission, registry))
}

/** Whether the actor may give or take away `role`: they hold every permission it expands to (sensitive ones by name). */
export function canManageRole(role: string, table: RoleTable, registry: PermissionRegistry, actorHeld: readonly string[]): boolean {
  return missingForRole(role, table, registry, actorHeld).length === 0
}

/** The roles an actor may assign: configured, assignable (not `auto`, not a default role) and within their own permissions. */
export function assignableRoles(table: RoleTable, registry: PermissionRegistry, actorHeld: readonly string[]): string[] {
  return Object.values(table.roles)
    .filter(role => role.assignable && canManageRole(role.name, table, registry, actorHeld))
    .map(role => role.name)
    .sort()
}

/**
 * Plans replacing a user's assigned roles. Adding or removing role R needs the actor to hold every permission of R;
 * adding an `auto` role, a default role or one marked `assignable: false` is a 409 `role_not_assignable`; adding a role
 * that is not configured is a 400. Removing a stored role that is no longer configured needs nothing (it holds nothing).
 */
export function planRoleAssignment(input: RoleAssignmentInput): RoleAssignmentPlan {
  const { table, registry, actorHeld } = input
  const sso = new Set(input.current.filter(row => row.source === 'sso').map(row => row.role))
  const managed = new Set(input.current.filter(row => row.source !== 'sso').map(row => row.role))
  const requested = new Set(input.requested)

  const add = [...requested].filter(role => !managed.has(role) && !sso.has(role)).sort()
  const remove = [...managed].filter(role => !requested.has(role)).sort()

  for (const role of add) {
    const compiled = Object.hasOwn(table.roles, role) ? table.roles[role] : undefined
    if (!compiled) return { ok: false, status: 400, code: 'unknown_role', role, message: `Role "${role}" does not exist.` }
    if (!compiled.assignable) {
      const why = compiled.auto ? 'is held automatically' : compiled.default ? 'is held by every user' : 'cannot be assigned'
      return { ok: false, status: 409, code: 'role_not_assignable', role, message: `Role "${role}" ${why}.` }
    }
  }
  for (const role of [...add, ...remove]) {
    const missing = missingForRole(role, table, registry, actorHeld)
    if (missing.length) {
      return { ok: false, status: 403, code: 'forbidden', role, missing, message: `You cannot ${add.includes(role) ? 'assign' : 'remove'} the role "${role}": it holds permissions you do not hold.` }
    }
  }

  const next = [...new Set([...[...managed].filter(role => !remove.includes(role)), ...add, ...sso])].sort()
  return { ok: true, add, remove, next }
}
