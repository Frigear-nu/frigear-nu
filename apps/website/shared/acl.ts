/** A comma separated email allowlist from runtime config (`NUXT_ACL_ADMINS`), lowercased. */
export const parseEmailList = (list: unknown): string[] =>
  String(list ?? '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean)

/** The fields of a user that the email allowlist looks at. */
export type AllowlistUser = { email?: string | null, emailVerifiedAt?: unknown }

/**
 * Whether the user's address is on `allowlist` *and verified*. An unverified address proves nothing: anyone can sign
 * up with it (or have it written by lower staff), so it never grants access through an allowlist.
 */
export const isAllowlisted = (user: AllowlistUser, allowlist: readonly string[]): boolean =>
  !!user.emailVerifiedAt && !!user.email && allowlist.includes(user.email.trim().toLowerCase())

/**
 * Whether a non-admin may write `email` to an account: not when it is on the `NUXT_ACL_ADMINS` allowlist, since the
 * account would become an admin once the address is verified (and staff can mark it verified). Admins may always.
 */
export const allowsStaffAddressWrite = (isAdmin: boolean, email: string | undefined, admins: readonly string[]): boolean =>
  isAdmin || !email || !admins.includes(email.trim().toLowerCase())
