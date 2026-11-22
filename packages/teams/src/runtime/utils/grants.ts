// The `team` grant kind's shape, framework free: the server kind, the `<GrantsEditor>` field and tests share it.
import { z } from 'zod'
import type { TeamGrant, TeamKindGrant } from '../../types'

const teamRoleKey = z.string().trim().min(1).max(64)

/**
 * A `team` grant: `{ kind: 'team', teamId, minRole }` for one team, or `{ kind: 'team', teamKind, minRole }` for every
 * team of a kind. Exactly one of `teamId` and `teamKind`.
 */
export const teamGrantSchema = z.union([
  z.strictObject({ kind: z.literal('team'), teamId: z.string().trim().min(1).max(64), minRole: teamRoleKey }),
  z.strictObject({ kind: z.literal('team'), teamKind: z.string().trim().min(1).max(64), minRole: teamRoleKey }),
])

/** Whether the grant names every team of a kind rather than one team. */
export function isTeamKindGrant(grant: TeamGrant): grant is TeamKindGrant {
  return 'teamKind' in grant
}
