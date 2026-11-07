import type { AllowlistUser } from '#shared/acl'

// Session mapper of `@frigear-nu/auth` (`authentication.settings.session.mapper`): applies the `NUXT_ACL_ADMINS`
// allowlist (verified addresses only, so verifying by the emailed link signs the first admin in as admin).
export default function mapSessionUser<T extends AllowlistUser>(user: T) {
  return { ...user, role: effectiveRole(user) }
}
