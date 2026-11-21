import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { apiError } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { TeamLadderDto } from '../../../../types'

// Replaces the ladder of a team kind (a new kind starts its ladder). A role that a member of a team of this kind holds,
// or a rule maps to, cannot be removed: `409 team_role_in_use`, with the roles in `data.roles`.
export default defineEventHandler(async (event): Promise<TeamLadderDto> => {
  await authorize(event, teamsAccess.permissions.manage)
  const { kind } = await getValidatedRouterParams(event, teamLadderParams.parse)
  const input = await readValidatedBody(event, teamLadderInput.parse)
  const keys = input.roles.map(role => role.key)

  const held = await db.selectDistinct({ role: schema.teamMembers.role }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(and(eq(schema.teams.kind, kind), notInArray(schema.teamMembers.role, keys)))
  const kindTeams = db.select({ id: schema.teams.id }).from(schema.teams).where(eq(schema.teams.kind, kind))
  const mapped = await db.selectDistinct({ role: schema.teamRoleMappings.teamRole }).from(schema.teamRoleMappings)
    .where(and(inArray(schema.teamRoleMappings.teamId, kindTeams), notInArray(schema.teamRoleMappings.teamRole, keys)))
  const inUse = [...new Set([...held, ...mapped].map(row => row.role))].sort()
  if (inUse.length) {
    throw apiError(409, 'team_role_in_use', `These roles are still in use: ${inUse.join(', ')}.`, { roles: inUse })
  }

  const values = { roles: input.roles, leadFrom: input.leadFrom ?? null }
  await db.insert(schema.teamRoleLadders).values({ kind, ...values })
    .onConflictDoUpdate({ target: schema.teamRoleLadders.kind, set: { ...values, updatedAt: new Date() } })
  forgetTeamLadders(event)
  forgetTeamRoles(event)
  return { kind, ...values, source: 'stored' }
})
