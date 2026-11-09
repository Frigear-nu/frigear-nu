import { userRoles } from '#shared/roles'
import { parseEmailList, resolveEffectiveRole } from '#shared/acl'
import type { AllowlistUser } from '#shared/acl'

/**
 * The role a user effectively has: the stored one, except that verified emails in `NUXT_ACL_ADMINS` (comma separated)
 * are always admins. That list bootstraps the first admin (who verifies their address through the emailed link) and
 * is applied the same way to the session (see `map-session-user.ts`) and to policies, without writing to the database.
 * Pass the whole stored user: without `emailVerifiedAt` the allowlist does not apply.
 */
export function effectiveRole(user: AllowlistUser): string {
  return resolveEffectiveRole(user, parseEmailList(useRuntimeConfig().aclAdmins), userRoles)
}

/** The addresses that give staff access once verified: `NUXT_ACL_ADMINS`, `NUXT_OAUTH_ADMIN_EMAILS`, `NUXT_FORMS_ADMIN_EMAILS`. */
export function staffAllowlists() {
  const config = useRuntimeConfig()
  return {
    admins: parseEmailList(config.aclAdmins),
    oauthAdmins: parseEmailList(config.oauthAdminEmails),
    formsAdmins: parseEmailList(config.formsAdminEmails),
  }
}
