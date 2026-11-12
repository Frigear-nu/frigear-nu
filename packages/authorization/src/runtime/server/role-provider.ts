import type { AuthRoleProvider } from '@frigear-nu/auth/utils'
import { ensureAuthorizationRoleMigration, listAuthorizationUserRoles, setAuthorizationUserRoles } from './utils/authorization-roles'

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
}

export default provider
