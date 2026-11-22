import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { notFound, validationError } from '@frigear-nu/module-kit/server'
import type { TeamOwner, TeamRoleMatch } from '../../../types'
import { ladderKeys } from '../../utils/ladders'
import { sameTeamOwner } from '../../utils/resolve'
import { assertTeamRoleOnLadder, loadTeamLadders } from './teams-ladders'
import { findTeamById } from './teams'

export type TeamMappingRow = typeof schema.teamRoleMappings.$inferSelect

/** The rule with this id, or a 404. */
export async function getTeamMappingOr404(id: string): Promise<TeamMappingRow> {
  const [row] = await db.select().from(schema.teamRoleMappings).where(eq(schema.teamRoleMappings.id, id)).limit(1)
  if (!row) throw notFound('Mapping rule not found.')
  return row
}

/**
 * Checks a rule's target: `teamId` must be a team of the rule's owner and `teamRole` a role of that team kind's ladder.
 * A rule for every team of the owner needs a `teamRole` that is on at least one ladder (teams of other kinds skip it).
 */
export async function assertTeamMappingTarget(event: H3Event, rule: TeamOwner & { teamId: string | null, teamRole: string }): Promise<void> {
  if (rule.teamId) {
    const team = await findTeamById(rule.teamId)
    if (!team || !sameTeamOwner({ ownerType: team.ownerType, ownerId: team.ownerId ?? null }, rule)) {
      throw validationError([{ path: ['teamId'], message: 'The team must belong to the rule\'s owner.' }], 'Unknown team')
    }
    await assertTeamRoleOnLadder(event, team.kind, rule.teamRole, 'teamRole')
    return
  }
  const ladders = await loadTeamLadders(event)
  if (!Object.values(ladders).some(ladder => ladderKeys(ladder).includes(rule.teamRole))) {
    throw validationError([{ path: ['teamRole'], message: `"${rule.teamRole}" is not a role of any ladder.` }], 'Unknown team role')
  }
}

/** The stored form of a match: one key, trimmed. */
export function normalizeTeamRoleMatch(match: TeamRoleMatch): TeamRoleMatch {
  return 'role' in match ? { role: match.role } : { plan: match.plan }
}
