/**
 * Role hierarchy helpers. A hierarchy is an array of role names **from highest to lowest** rank, e.g.
 * `['admin', 'manager', 'member', 'user']`. Unknown roles never outrank (or equal) anything.
 */
export type RoleHierarchy = readonly string[]

/** Whether `source` ranks strictly above `target`. */
export function roleIsHigher(roles: RoleHierarchy, source: string | null | undefined, target: string | null | undefined): boolean {
  if (!source || !target || !roles.includes(source) || !roles.includes(target)) return false
  return roles.indexOf(source) < roles.indexOf(target)
}

/** Whether `source` ranks above or equal to `target`. */
export function roleIsHigherOrEqual(roles: RoleHierarchy, source: string | null | undefined, target: string | null | undefined): boolean {
  if (!source || !target || !roles.includes(source) || !roles.includes(target)) return false
  return roles.indexOf(source) <= roles.indexOf(target)
}

/**
 * Whether `actor` may assign (or change) the role `target`: only roles strictly below their own, unless the actor's
 * own role is listed in `equalAllowedFor` (e.g. `['admin']`, so admins can create other admins).
 */
export function canManageRole(
  roles: RoleHierarchy,
  actor: string | null | undefined,
  target: string | null | undefined,
  { equalAllowedFor = [] }: { equalAllowedFor?: readonly string[] } = {},
): boolean {
  if (roleIsHigher(roles, actor, target)) return true
  return !!actor && actor === target && equalAllowedFor.includes(actor) && roles.includes(actor)
}
