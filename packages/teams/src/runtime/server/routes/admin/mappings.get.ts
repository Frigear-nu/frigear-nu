import { db, schema } from '@nuxthub/db'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { teamsAccess } from '../../../access'
import type { TeamRoleMappingDto } from '../../../../types'

// The role mapping rules (a small, bounded list), highest priority first. `ownerType` / `ownerId` narrow it to an
// owner; `teamId` to the rules that cover one team (its own rules and the owner-wide ones).
export default defineEventHandler(async (event): Promise<TeamRoleMappingDto[]> => {
  await authorize(event, teamsAccess.permissions.manage)
  const query = await getValidatedQuery(event, teamMappingQuery.parse)
  const conditions: (SQL | undefined)[] = []
  if (query.teamId) {
    const team = await getTeamOr404(query.teamId)
    conditions.push(
      eq(schema.teamRoleMappings.ownerType, team.ownerType),
      team.ownerId === null ? isNull(schema.teamRoleMappings.ownerId) : eq(schema.teamRoleMappings.ownerId, team.ownerId),
      or(isNull(schema.teamRoleMappings.teamId), eq(schema.teamRoleMappings.teamId, team.id)),
    )
  }
  else {
    if (query.ownerType) conditions.push(eq(schema.teamRoleMappings.ownerType, query.ownerType))
    if (query.ownerId) conditions.push(eq(schema.teamRoleMappings.ownerId, query.ownerId))
    else if (query.ownerType === 'platform') conditions.push(isNull(schema.teamRoleMappings.ownerId))
  }
  const rows = await db.select().from(schema.teamRoleMappings).where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.teamRoleMappings.priority), schema.teamRoleMappings.createdAt)
  return rows.map(toTeamRoleMappingDto)
})
