import { z } from 'zod'

/** The grant of the `role` kind (grant lists of `@frigear-nu/auth`): callers holding this global role. */
export type RoleGrant = { kind: 'role', role: string }

/** The schema of a `role` grant. */
export const roleGrantSchema = z.strictObject({ kind: z.literal('role'), role: z.string().trim().min(1).max(64) })

/** The roles that grant any of `wanted` (moved to `@frigear-nu/auth`, re-exported here for existing imports). */
export { rolesGranting } from '@frigear-nu/auth/access'
