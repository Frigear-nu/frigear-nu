// Typed paths of the module's HTTP routes, for app code, tests and docs (no string literals elsewhere).
// Also published as `@frigear-nu/authorization/api`: safe to import from another module's app code.
import type {
  AuthorizationPermissionMatrixDto,
  AuthorizationPermissionsDto,
  AuthorizationRoleDto,
  AuthorizationRolePermissionDto,
  AuthorizationRoleSummaryDto,
  AuthorizationRoleUserDto,
  AuthorizationRoleUsersPageDto,
} from '../../types'

export type {
  AuthorizationPermissionMatrixDto,
  AuthorizationPermissionsDto,
  AuthorizationRoleDto,
  AuthorizationRolePermissionDto,
  AuthorizationRoleSummaryDto,
  AuthorizationRoleUserDto,
  AuthorizationRoleUsersPageDto,
}

const base = '/api/authorization'
const adminBase = '/api/admin/authorization'
const role = (name: string) => `${adminBase}/roles/${encodeURIComponent(name)}`

/** The authorization API: the caller's own permissions under `/api/authorization`, the roles admin under `/api/admin/authorization` (`rbac`). */
export const authorizationApi = {
  me: {
    /** `GET`: the caller's role and permissions. */
    permissions: `${base}/me/permissions`,
  },
  admin: {
    /** `GET`: every role, most senior first (`roles:read`). */
    roles: `${adminBase}/roles`,
    /** `GET`: one role with every registered permission and why it holds it; 404 for an unknown role. */
    role,
    /** `GET`: the users whose stored role is `name`, paginated (`useTableQuery` keys). */
    roleUsers: (name: string) => `${role(name)}/users`,
    /** `GET`: every registered permission against every role. */
    permissions: `${adminBase}/permissions`,
  },
} as const
