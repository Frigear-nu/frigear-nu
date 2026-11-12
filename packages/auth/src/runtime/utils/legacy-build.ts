import type { Nuxt } from '@nuxt/schema'
import type { AuthRoleDefinition, AuthScopeDefinition } from '../../types'
import type { RoleExtension, RoleRegistration } from './access-compile'
import type { PermissionDefinition } from './permissions'

// TEMPORARY adapters of the old build API, so modules not yet migrated keep building. They register through the old
// hooks (`auth:scopes`, `auth:roles`), which auth converts into permissions and roles at `modules:done`.
// @deprecated — removed in phase 2.

/**
 * Declare scopes that user tokens can be granted.
 * @deprecated — removed in phase 2. Use `addPermission` (and `implicit` instead of `aggregateTo: ['user']`).
 */
export function addAuthScope(nuxt: Nuxt, ...scopes: AuthScopeDefinition[]) {
  nuxt.hook('auth:scopes', (list) => {
    list.push(...scopes)
  })
}

/**
 * Ship a role with a module.
 * @deprecated — removed in phase 2. Use `addRole`.
 */
export function addAuthRole(nuxt: Nuxt, ...roles: AuthRoleDefinition[]) {
  nuxt.hook('auth:roles', (list) => {
    list.push(...roles)
  })
}

export interface LegacyAccess {
  permissions: PermissionDefinition[]
  roles: RoleRegistration[]
  extensions: RoleExtension[]
}

/**
 * Converts old scope and role registrations:
 * - a scope becomes a permission; `aggregateTo` (or the deprecated `roles`) containing `user` makes it `implicit`, the
 *   other roles become its `grantTo`; without either, it is granted to `admin` (by name, so a `:pii` one too), as
 *   before;
 * - a role becomes a module role that inherits `inherits` (default `user`) and is inherited by `inheritedBy` (default
 *   `admin`), each only when that role exists.
 */
export function convertLegacyAccess(scopes: readonly AuthScopeDefinition[], roles: readonly AuthRoleDefinition[]): LegacyAccess {
  const permissions: PermissionDefinition[] = []
  const extensions: RoleExtension[] = []
  for (const scope of scopes) {
    const aggregate = scope.aggregateTo ?? scope.roles ?? []
    const grantTo = aggregate.length ? aggregate.filter(role => role !== 'user') : ['admin']
    permissions.push({
      name: scope.name,
      description: scope.description,
      ...(scope.sessionOnly && { sessionOnly: true }),
      ...(aggregate.includes('user') && { implicit: true }),
      ...(grantTo.length && { grantTo }),
    })
  }
  const converted: RoleRegistration[] = roles.map(role => ({
    name: role.name,
    label: role.label,
    description: role.description,
    grant: [...(role.permissions ?? [])],
    inherit: [...(role.inherits ?? ['user'])],
    legacy: true,
  }))
  for (const role of roles) {
    for (const parent of role.inheritedBy ?? ['admin']) extensions.push({ role: parent, inherit: [role.name] })
  }
  return { permissions, roles: converted, extensions }
}
