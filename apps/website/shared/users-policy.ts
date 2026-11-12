/**
 * What the users admin adds on top of the roles (`authorization.roles`, which decide who may list, create, edit and
 * delete users, and keep everyone to roles below their own). Pure so it can be tested; roles are *effective* roles:
 *
 * - writing an address on a staff allowlist (`staffEmails`) makes the account admin-level once the address is
 *   verified (and staff can mark it verified), so only admins may;
 * - a user who is an admin through `NUXT_ACL_ADMINS` (stored role lower) may only be changed by admins.
 */
export function allowsStaffAddressChange(
  role: string,
  details: {
    input?: { email?: string }
    target?: { role?: string }
    /** Lowercase addresses that grant staff access: `NUXT_ACL_ADMINS`, `NUXT_OAUTH_ADMIN_EMAILS`, `NUXT_FORMS_ADMIN_EMAILS`. */
    staffEmails?: readonly string[]
  } = {},
): boolean {
  if (role === 'admin') return true
  if (details.target?.role === 'admin') return false
  const email = details.input?.email?.trim().toLowerCase()
  return !email || !details.staffEmails?.includes(email)
}
