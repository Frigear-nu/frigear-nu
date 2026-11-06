import { canManageRole } from '@frigear-nu/authorization/utils'
import { adminAreaRoles, userManagerRoles, userRoles } from './roles'

type Action = 'view' | 'create' | 'update' | 'delete'

/**
 * Who may administer users (ported from the old `canViewUsers`/`canManageUsers` abilities, plus the role ceiling of
 * #648). Pure so it can be tested: `role`/`target.role` are *effective* roles.
 *
 * - staff roles (`admin`, `manager`, `coordinator`) may list users;
 * - `admin` and `manager` may create, edit and delete them;
 * - nobody may hand out, or change a user holding, a role above their own - only strictly lower roles, except that an
 *   admin may manage other admins;
 * - the role is judged as it will be after the change too: writing an address on a staff allowlist (`staffEmails`)
 *   makes the account admin-level once the address is verified (and staff can mark it verified), so only admins may.
 */
/** The roles `role` may hand out: strictly lower ones, plus their own for admins. */
export function assignableUserRoles(role: string): string[] {
  if (!(userManagerRoles as readonly string[]).includes(role)) return []
  return userRoles.filter(target => canManageRole(userRoles, role, target, { equalAllowedFor: ['admin'] }))
}

export function canAdministerUsers(
  role: string,
  action: Action,
  details: {
    input?: { role?: string, email?: string }
    target?: { role?: string }
    /** Lowercase addresses that grant staff access: `NUXT_ACL_ADMINS`, `NUXT_OAUTH_ADMIN_EMAILS`, `NUXT_FORMS_ADMIN_EMAILS`. */
    staffEmails?: readonly string[]
  } = {},
): boolean {
  if (action === 'view') return (adminAreaRoles as readonly string[]).includes(role)
  if (!(userManagerRoles as readonly string[]).includes(role)) return false

  const equal = { equalAllowedFor: ['admin'] }
  const assigns = details.input?.role === undefined || canManageRole(userRoles, role, details.input.role, equal)
  const touches = details.target?.role === undefined || canManageRole(userRoles, role, details.target.role, equal)
  const email = details.input?.email?.trim().toLowerCase()
  const writesStaffEmail = !!email && !!details.staffEmails?.includes(email)
  return assigns && touches && (!writesStaffEmail || role === 'admin')
}
