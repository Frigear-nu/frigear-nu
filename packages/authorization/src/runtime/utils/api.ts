// Typed paths of the module's HTTP routes, for app code, tests and docs (no string literals elsewhere).
// Also published as `@frigear-nu/authorization/api`: safe to import from another module's app code.
// The caller's own access (`GET /api/auth/me/access`) belongs to `@frigear-nu/auth`: `authApi.me.access`.
import type {
  AuthorizationAssignedRoleDto,
  AuthorizationPermissionGrant,
  AuthorizationPermissionSource,
  AuthorizationRoleDto,
  AuthorizationRolePermissionDto,
  AuthorizationRoleSummaryDto,
  AuthorizationRoleUserDto,
  AuthorizationRoleUsersPageDto,
  AuthorizationUserRolesDto,
  AuthorizationUserRolesInput,
} from '../../types'

export type {
  AuthorizationAssignedRoleDto,
  AuthorizationPermissionGrant,
  AuthorizationPermissionSource,
  AuthorizationRoleDto,
  AuthorizationRolePermissionDto,
  AuthorizationRoleSummaryDto,
  AuthorizationRoleUserDto,
  AuthorizationRoleUsersPageDto,
  AuthorizationUserRolesDto,
  AuthorizationUserRolesInput,
}

const adminBase = '/api/admin/authorization'
const role = (name: string) => `${adminBase}/roles/${encodeURIComponent(name)}`

/** The roles admin under `/api/admin/authorization`. */
export const authorizationApi = {
  admin: {
    /** `GET`: every configured role (`roles:read`). */
    roles: `${adminBase}/roles`,
    /** `GET`: one role with every registered permission and why it holds it; 404 for an unknown role. */
    role,
    /** `GET`: the users with an assigned row for `name`, paginated (`useTableQuery` keys). */
    roleUsers: (name: string) => `${role(name)}/users`,
    /** `GET` (`roles:read` or `roles:assign`) / `PUT` (`roles:assign`, session only): a user's assigned roles. */
    userRoles: (id: number | string) => `${adminBase}/users/${encodeURIComponent(String(id))}/roles`,
  },
} as const
