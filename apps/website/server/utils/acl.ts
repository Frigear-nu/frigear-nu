import { userRoles } from '#shared/roles'

/**
 * The role a user effectively has: the stored one, except that emails in `NUXT_ACL_ADMINS` (comma separated) are
 * always admins. That list bootstraps the first admin and is applied the same way to the session (see
 * `map-session-user.ts`) and to policies, without writing to the database.
 */
export function effectiveRole(user: { email: string, role?: string | null }): string {
  const admins = (useRuntimeConfig().aclAdmins as string).split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
  if (admins.includes(user.email.toLowerCase())) return 'admin'
  return userRoles.includes(user.role as never) ? user.role! : 'user'
}
