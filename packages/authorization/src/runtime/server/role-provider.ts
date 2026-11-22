import type { AuthRoleProvider } from '@frigear-nu/auth/utils'
import { ensureAuthorizationRoleMigration, listAuthorizationRoleHolders, listAuthorizationRolesOf, listAuthorizationUserRoles, setAuthorizationUserRoles } from './utils/authorization-roles'

// The role provider auth reads assigned roles through (`setRoleProvider`), backed by `authorization_user_roles`. Auth adds
// the default, `auto` and `authorization:roles` roles, checks requirements and closes over `inherit`, and caches the
// result per request.
const provider: AuthRoleProvider = {
  async getAssignedRoles(_event, userId) {
    // Before the first read, so a user never acts without their migrated role.
    await ensureAuthorizationRoleMigration()
    return (await listAuthorizationUserRoles(Number(userId))).map(row => row.role)
  },
  async setRoles(userId, roles, options) {
    await setAuthorizationUserRoles(Number(userId), roles, { source: options.source, grantedBy: options.grantedBy ?? null })
  },
  // Who has one of `roles` stored, for auth's `listRoleHolders` (which closes over `inherit` and checks the result).
  async holders(roles, options) {
    await ensureAuthorizationRoleMigration()
    return listAuthorizationRoleHolders(roles, options.limit)
  },
  // The stored roles of many users in one chunked query, so `listRoleHolders` (the `role` grant kind's `members`) does
  // not read them once per holder.
  async assignedRolesOf(userIds) {
    await ensureAuthorizationRoleMigration()
    return listAuthorizationRolesOf(userIds)
  },
}

export default provider
