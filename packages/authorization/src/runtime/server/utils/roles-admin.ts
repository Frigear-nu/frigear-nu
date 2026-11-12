import type { H3Event } from 'h3'
import { permissions as registeredScopes } from '#auth/scopes'
import { notFound } from '@frigear-nu/module-kit/server'
import type {
  AuthorizationPermissionMatrixDto,
  AuthorizationRoleDto,
  AuthorizationRoleSummaryDto,
  AuthorizationRoleUserDto,
} from '../../../types'
import { AUTHORIZATION_ROLES_READ_SCOPE } from '../../utils/rbac'
import type { RbacRole, RbacTable } from '../../utils/rbac'
import { heldPermissionCount, permissionMatrix, rolePermissionRows } from '../../utils/rbac-view'

export { AUTHORIZATION_ROLES_READ_SCOPE }

/**
 * The staff gate of the roles admin. The role decides (`roles:read`); the host may add conditions through the
 * `authorization:authorize` Nitro hook.
 */
export const authorizationRolesStaff = defineStaffGuard({
  hook: 'authorization:authorize',
  scope: AUTHORIZATION_ROLES_READ_SCOPE,
  message: 'You are not allowed to see roles.',
})

/** The compiled table; 404 when `rbac` is off (the routes are only registered with it). */
export function requireAuthorizationRolesTable(): RbacTable {
  const table = useAuthorizationRoles()
  if (!table) throw notFound('Role-based access control is not enabled.')
  return table
}

/** The role named `name`, or 404 `not_found`. */
export function requireAuthorizationRole(name: string): { table: RbacTable, role: RbacRole, rank: number } {
  const table = requireAuthorizationRolesTable()
  const rank = table.roles.findIndex(role => role.name === name)
  if (rank === -1) throw notFound(`Role "${name}" does not exist.`)
  return { table, role: table.roles[rank]!, rank }
}

export function toAuthorizationRoleSummaryDto(table: RbacTable, role: RbacRole, rank: number, userCount: number): AuthorizationRoleSummaryDto {
  return {
    name: role.name,
    label: role.label,
    description: role.description ?? null,
    source: role.source,
    inherits: [...role.inherits],
    rank,
    isDefault: table.defaultRole === role.name,
    userCount,
    permissionCount: heldPermissionCount(role, registeredScopes),
  }
}

export function toAuthorizationRoleDto(table: RbacTable, role: RbacRole, rank: number, userCount: number): AuthorizationRoleDto {
  return {
    ...toAuthorizationRoleSummaryDto(table, role, rank, userCount),
    permissions: rolePermissionRows(role, registeredScopes),
  }
}

export function toAuthorizationPermissionMatrixDto(table: RbacTable): AuthorizationPermissionMatrixDto {
  return permissionMatrix(table, registeredScopes)
}

export function toAuthorizationRoleUserDto(user: { id: number, name: string, email: string }): AuthorizationRoleUserDto {
  return { id: user.id, name: user.name, email: user.email }
}

/** Guards a roles admin route: staff check first, then the table (404 without `rbac`). */
export async function requireAuthorizationRolesStaff(event: H3Event): Promise<RbacTable> {
  await authorizationRolesStaff.require(event)
  return requireAuthorizationRolesTable()
}
