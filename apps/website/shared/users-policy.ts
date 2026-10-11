import { canManageRole } from '@frigear-nu/authorization/utils'
import { adminAreaRoles, userManagerRoles, userRoles } from './roles'

type Action = 'view' | 'create' | 'update'

/**
 * Who may administer users (ported from the old `canViewUsers`/`canManageUsers` abilities, plus the role ceiling of
 * #648). Pure so it can be tested: `role`/`target.role` are *effective* roles.
 *
 * - staff roles (`admin`, `manager`, `coordinator`) may list users;
 * - `admin` and `manager` may create and edit them;
 * - nobody may hand out, or change a user holding, a role above their own - only strictly lower roles, except that an
 *   admin may manage other admins.
 */
export function canAdministerUsers(
  role: string,
  action: Action,
  details: { input?: { role?: string }, target?: { role?: string } } = {},
): boolean {
  if (action === 'view') return (adminAreaRoles as readonly string[]).includes(role)
  if (!(userManagerRoles as readonly string[]).includes(role)) return false

  const equal = { equalAllowedFor: ['admin'] }
  const assigns = details.input?.role === undefined || canManageRole(userRoles, role, details.input.role, equal)
  const touches = details.target?.role === undefined || canManageRole(userRoles, role, details.target.role, equal)
  return assigns && touches
}
