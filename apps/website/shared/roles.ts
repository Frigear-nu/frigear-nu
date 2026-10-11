// Role hierarchy, highest rank first. Ported from the old app's `shared/schema/user.ts` (`userRoles`).
export const userRoles = [
  'admin',
  'manager',
  'coordinator',
  'eventmanager',
  'barmanager',
  'crew',
  'member',
  'supplier',
  'partner',
  'user',
] as const

export type UserRole = (typeof userRoles)[number]

/** Roles that may open the admin area and list users. */
export const adminAreaRoles: readonly UserRole[] = ['admin', 'manager', 'coordinator']
/** Roles that may create and edit users. */
export const userManagerRoles: readonly UserRole[] = ['admin', 'manager']
