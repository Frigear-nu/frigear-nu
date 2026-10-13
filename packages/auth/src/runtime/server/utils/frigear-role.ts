/** The `role` claim of frigear.nu (a string), or the first entry of a `roles` array; anything else is ignored. */
export function parseRoleClaim(claims: Record<string, unknown>): string | undefined {
  const { role, roles } = claims
  if (typeof role === 'string' && role.trim()) return role.trim()
  if (Array.isArray(roles)) return roles.find((entry): entry is string => typeof entry === 'string' && !!entry.trim())?.trim()
  return undefined
}
