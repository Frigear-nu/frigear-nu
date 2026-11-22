import { z } from 'zod'

/** The grant of the `role` kind (grant lists of `@frigear-nu/auth`): callers holding this global role. */
export type RoleGrant = { kind: 'role', role: string }

/** The schema of a `role` grant. */
export const roleGrantSchema = z.strictObject({ kind: z.literal('role'), role: z.string().trim().min(1).max(64) })

/** The roles that grant any of `wanted`: the roles themselves and every role inheriting one, directly or not. */
export function rolesGranting(roles: Readonly<Record<string, { inherit?: readonly string[] }>>, wanted: readonly string[]): string[] {
  const result = new Set(wanted)
  let grew = true
  while (grew) {
    grew = false
    for (const [name, role] of Object.entries(roles)) {
      if (!result.has(name) && (role.inherit ?? []).some(parent => result.has(parent))) {
        result.add(name)
        grew = true
      }
    }
  }
  return [...result].sort()
}
