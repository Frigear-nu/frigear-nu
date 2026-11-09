export const roleIsHigher = <T>(
  roles: T[] | readonly T[],
  sourceRole: T,
  compareRole: T,
) => {
  if (!sourceRole || !compareRole) return false
  if (!roles.includes(sourceRole) || !roles.includes(compareRole)) return false
  return roles.indexOf(sourceRole) < roles.indexOf(compareRole)
}

export const roleIsHigherOrEqual = <T>(
  roles: T[] | readonly T[],
  sourceRole: T,
  compareRole: T,
) => {
  if (!sourceRole || !compareRole) return false
  if (!roles.includes(sourceRole) || !roles.includes(compareRole)) return false
  return roles.indexOf(sourceRole) <= roles.indexOf(compareRole)
}

/** A comma separated email allowlist from runtime config (`NUXT_ACL_ADMINS`, ...), lowercased. */
export const parseEmailList = (list: unknown): string[] =>
  String(list ?? '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean)

/** The fields of a stored user that the email allowlists look at. */
export type AllowlistUser = { email: string, role?: string | null, emailVerifiedAt?: unknown }

/**
 * Whether the user's address is on `allowlist` *and verified*. An unverified address proves nothing: anyone can sign
 * up with it (or have it written by lower staff), so it never grants access through an allowlist.
 */
export const isAllowlisted = (user: AllowlistUser, allowlist: readonly string[]): boolean =>
  !!user.emailVerifiedAt && allowlist.includes(user.email.trim().toLowerCase())

/** The stored role (unknown roles are `user`), or `admin` for a verified address on the `admins` allowlist. */
export function resolveEffectiveRole<R extends string>(user: AllowlistUser, admins: readonly string[], roles: readonly R[]): R | 'admin' | 'user' {
  if (isAllowlisted(user, admins)) return 'admin'
  return roles.includes(user.role as R) ? user.role as R : 'user'
}
