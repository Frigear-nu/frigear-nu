import { matches } from '@frigear-nu/auth/utils'
import type { CompiledRole, PermissionRegistry, ResolvedPermission, RoleTable } from '@frigear-nu/auth/utils'
import type {
  AuthorizationMatrixPermissionDto,
  AuthorizationPermissionGrant,
  AuthorizationPermissionSource,
  AuthorizationRoleDto,
  AuthorizationRoleMatrixDto,
  AuthorizationRolePermissionDto,
  AuthorizationRoleSummaryDto,
} from '../../types'

// How the compiled role table reads in the roles admin. Pure: the routes hand in the table and the registry.

const own = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined => Object.hasOwn(table, key) ? table[key] : undefined

/** Whether one configured grant covers `permission`: by name, by a wildcard (never a sensitive one) or as an alias. */
function grantCovers(grant: string, permission: ResolvedPermission, registry: PermissionRegistry): boolean {
  return matches(grant, permission.name, permission) || !!own(registry.aliases, grant)?.includes(permission.name)
}

/** Why `role` holds `permission`: its own grant, a grant of a role it inherits, or the permission being implicit. */
export function permissionGrant(role: CompiledRole, permission: ResolvedPermission, table: RoleTable, registry: PermissionRegistry): AuthorizationPermissionGrant | null {
  const own = role.grant.find(grant => grantCovers(grant, permission, registry))
  if (own) return { via: 'granted', by: own }
  for (const ancestor of role.inherited) {
    const grant = table.roles[ancestor]?.grant.find(candidate => grantCovers(candidate, permission, registry))
    if (grant) return { via: 'inherited', from: ancestor, by: grant }
  }
  return permission.implicit ? { via: 'implicit' } : null
}

/** The registered permissions, sorted by group then name. */
export function sortedPermissions(registry: PermissionRegistry): ResolvedPermission[] {
  return Object.values(registry.permissions).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
}

/** Roles in display order: assignable roles first, then default, then `auto`; by label within each. */
export function sortedRoles(table: RoleTable): CompiledRole[] {
  const rank = (role: CompiledRole) => role.auto ? 2 : role.default ? 1 : 0
  return Object.values(table.roles).sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label) || a.name.localeCompare(b.name))
}

/** How many registered permissions `role` holds: its own and inherited grants plus the implicit ones (the "Held" rows of the role detail). */
export function heldPermissionCount(role: CompiledRole, table: RoleTable, registry: PermissionRegistry): number {
  return Object.values(registry.permissions).filter(permission => permissionGrant(role, permission, table, registry)).length
}

export function toRoleSummary(role: CompiledRole, userCount: number, table: RoleTable, registry: PermissionRegistry): AuthorizationRoleSummaryDto {
  return {
    name: role.name,
    label: role.label,
    labelKey: role.labelKey ?? null,
    description: role.description ?? null,
    descriptionKey: role.descriptionKey ?? null,
    inherit: [...role.inherit],
    inherited: [...role.inherited],
    requirements: Object.keys(role.requirements).sort(),
    auto: role.auto,
    default: role.default,
    assignable: role.assignable,
    userCount,
    permissionCount: heldPermissionCount(role, table, registry),
    from: role.from ?? null,
  }
}

/** Where `role`'s grant of `permission` comes from, as auth compiled it (`role.provenance`); empty when not held. */
export function permissionSources(role: CompiledRole, permission: string): AuthorizationPermissionSource[] {
  const sources = role.provenance && Object.hasOwn(role.provenance, permission) ? role.provenance[permission]! : []
  return sources.map(source => (source.from ? { via: source.via, from: source.from } : { via: source.via }))
}

/** A registered permission without a role's view of it (the matrix rows). */
export function toMatrixPermission(permission: ResolvedPermission): AuthorizationMatrixPermissionDto {
  return {
    name: permission.name,
    label: permission.label ?? null,
    labelKey: permission.labelKey ?? null,
    description: permission.description ?? null,
    descriptionKey: permission.descriptionKey ?? null,
    group: permission.group,
    sensitive: permission.sensitive,
    sessionOnly: permission.sessionOnly,
    implicit: permission.implicit,
    from: permission.from ?? null,
  }
}

export function toRolePermission(role: CompiledRole, permission: ResolvedPermission, table: RoleTable, registry: PermissionRegistry): AuthorizationRolePermissionDto {
  return {
    ...toMatrixPermission(permission),
    grant: permissionGrant(role, permission, table, registry),
    sources: permissionSources(role, permission.name),
  }
}

/** Every role against every registered permission, in display order; a cell only where the role holds the permission. */
export function toRoleMatrix(table: RoleTable, registry: PermissionRegistry, userCounts: ReadonlyMap<string, number> = new Map()): AuthorizationRoleMatrixDto {
  const roles = sortedRoles(table)
  const permissions = sortedPermissions(registry)
  const cells: AuthorizationRoleMatrixDto['cells'] = {}
  for (const role of roles) {
    const row: Record<string, AuthorizationPermissionGrant> = {}
    for (const permission of permissions) {
      const grant = permissionGrant(role, permission, table, registry)
      if (grant) row[permission.name] = grant
    }
    cells[role.name] = row
  }
  return {
    roles: roles.map(role => toRoleSummary(role, userCounts.get(role.name) ?? 0, table, registry)),
    permissions: permissions.map(toMatrixPermission),
    cells,
  }
}

export function toRoleDetail(role: CompiledRole, userCount: number, table: RoleTable, registry: PermissionRegistry): AuthorizationRoleDto {
  return {
    ...toRoleSummary(role, userCount, table, registry),
    grant: [...role.grant],
    permissions: sortedPermissions(registry).map(permission => toRolePermission(role, permission, table, registry)),
  }
}
