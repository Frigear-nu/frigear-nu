// Session mapper of `@frigear-nu/auth` (`authentication.settings.session.mapper`), called at sign-in: applies the
// `NUXT_ACL_ADMINS` allowlist, so the /admin route rule sees the effective role. Sign in again after changing it.
export default function mapSessionUser<T extends { email: string, role?: string | null }>(user: T) {
  return { ...user, role: effectiveRole(user) }
}
