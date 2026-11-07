// NOTE: the claims read here follow what the current frigear.nu identity provider (the original `nuxt-frigear-nu`
// app) publishes. This will change when this app takes over as the new frigear.nu: it will then be the provider
// itself, and the claim names and the role sync should be revisited.
/** The namespaced role claim the original frigear.nu identity provider also publishes. */
const NAMESPACED_ROLE_CLAIM = 'https://frigear.nu/claims/role'

const roleValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

/**
 * The `role` claim of frigear.nu (a string), else its namespaced variant, else the first entry of a `roles` array;
 * anything else is ignored.
 */
export function parseRoleClaim(claims: Record<string, unknown>): string | undefined {
  return parseRoleClaims(claims)[0]
}

/** Every role the claims name, in the order `parseRoleClaim` reads them. */
function parseRoleClaims(claims: Record<string, unknown>): string[] {
  const roles = Array.isArray(claims.roles) ? claims.roles.map(roleValue) : []
  return [roleValue(claims.role), roleValue(claims[NAMESPACED_ROLE_CLAIM]), ...roles].filter((role): role is string => !!role)
}

/**
 * The local role for the role claims of a verified id token: the first claimed role that `roleMap` maps (remote role ->
 * local role), else `defaultRole`. An unknown role or a missing claim never keeps or grants anything: it is the
 * default role.
 */
export function mapRoleClaim(claims: Record<string, unknown>, roleMap: Record<string, string>, defaultRole: string): string {
  for (const role of parseRoleClaims(claims)) {
    const local = Object.hasOwn(roleMap, role) ? roleValue(roleMap[role]) : undefined
    if (local) return local
  }
  return defaultRole
}
