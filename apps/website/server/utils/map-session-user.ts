// Session mapper of `@frigear-nu/users` (`users.settings.session.mapper`): applies the `NUXT_ACL_ADMINS` allowlist.
export default function mapSessionUser<T extends { email: string, role?: string | null }>(user: T) {
  return { ...user, role: effectiveRole(user) }
}
