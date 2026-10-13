/** The namespaced role claim the original frigear.nu identity provider also publishes. */
const NAMESPACED_ROLE_CLAIM = 'https://frigear.nu/claims/role'

/**
 * The `role` claim of frigear.nu (a string), else its namespaced variant, else the first entry of a `roles` array;
 * anything else is ignored.
 */
export function parseRoleClaim(claims: Record<string, unknown>): string | undefined {
  const { role, roles } = claims
  const namespaced = claims[NAMESPACED_ROLE_CLAIM]
  if (typeof role === 'string' && role.trim()) return role.trim()
  if (typeof namespaced === 'string' && namespaced.trim()) return namespaced.trim()
  if (Array.isArray(roles)) return roles.find((entry): entry is string => typeof entry === 'string' && !!entry.trim())?.trim()
  return undefined
}
