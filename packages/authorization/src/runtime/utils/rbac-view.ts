import type { RbacGrant, RbacRole, RbacTable } from './rbac'
import { holdsScopes } from './rules'

/** A registered permission (`#auth/scopes`). */
export interface RbacViewScope {
  name: string
  description?: string
}

const isWildcard = (permission: string) => permission === '*' || permission.endsWith(':*')

/** The part of a permission before its first `:` (`events:manage` → `events`). */
export function permissionResource(permission: string): string {
  const separator = permission.indexOf(':')
  return separator > 0 ? permission.slice(0, separator) : permission
}

/**
 * Why `role` holds `permission`, or `null` when it does not: its own grant, else the wildcard that covers it
 * (`resource:*` before `*`). Personal-data permissions (`:pii`) are never covered by a wildcard.
 */
export function rbacGrantFor(role: Pick<RbacRole, 'permissions' | 'grants'>, permission: string): RbacGrant | null {
  const own = role.grants[permission]
  if (own) return own
  if (!holdsScopes(role.permissions, [permission])) return null
  return role.grants[`${permissionResource(permission)}:*`] ?? role.grants['*'] ?? { via: 'all' }
}

/** The registered permissions, unique and sorted by name. */
export function sortedScopes(scopes: readonly RbacViewScope[]): RbacViewScope[] {
  return [...new Map(scopes.map(scope => [scope.name, scope])).values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** How many registered permissions `role` holds. */
export function heldPermissionCount(role: Pick<RbacRole, 'permissions' | 'grants'>, scopes: readonly RbacViewScope[]): number {
  return sortedScopes(scopes).filter(scope => rbacGrantFor(role, scope.name)).length
}

/** Every registered permission as `role` sees it, then the wildcards it holds. */
export function rolePermissionRows(role: Pick<RbacRole, 'permissions' | 'grants'>, scopes: readonly RbacViewScope[]) {
  const registered = sortedScopes(scopes).map(scope => ({
    name: scope.name,
    description: scope.description ?? null,
    pii: scope.name.endsWith(':pii'),
    resource: permissionResource(scope.name),
    wildcard: false,
    grant: rbacGrantFor(role, scope.name),
  }))
  const wildcards = role.permissions.filter(isWildcard).map(name => ({
    name,
    description: null,
    pii: false,
    resource: name === '*' ? '*' : permissionResource(name),
    wildcard: true,
    grant: role.grants[name] ?? null,
  }))
  return [...registered, ...wildcards]
}

/** Every registered permission against every role of `table`. */
export function permissionMatrix(table: RbacTable, scopes: readonly RbacViewScope[]) {
  return {
    roles: table.roles.map(role => ({ name: role.name, label: role.label })),
    permissions: sortedScopes(scopes).map(scope => ({
      name: scope.name,
      description: scope.description ?? null,
      pii: scope.name.endsWith(':pii'),
      resource: permissionResource(scope.name),
      holders: Object.fromEntries(table.roles.map(role => [role.name, rbacGrantFor(role, scope.name)])),
    })),
  }
}
