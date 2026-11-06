export const userRoles = ['admin', 'user'] as const

/**
 * The role a user effectively has: the stored one, except that verified emails in `NUXT_ACL_ADMINS` (comma separated)
 * are always admins. That list bootstraps the first admin without writing to the database, and is applied the same way
 * to the session (`map-session-user.ts`) and to the users admin policy (`server/plugins/users-policy.ts`). An unverified
 * address counts for nothing, since anyone can sign up with it: pass the stored user, `emailVerifiedAt` included.
 */
export function effectiveRole(user: { email: string, role?: string | null, emailVerifiedAt?: unknown }): string {
  const admins = String(useRuntimeConfig().aclAdmins).split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
  if (user.emailVerifiedAt && admins.includes(user.email.toLowerCase())) return 'admin'
  return userRoles.includes(user.role as never) ? user.role! : 'user'
}
