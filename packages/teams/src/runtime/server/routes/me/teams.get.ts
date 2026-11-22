import { db, schema } from '@nuxthub/db'
import { inArray } from 'drizzle-orm'
import { teamsAccess } from '../../../access'
import type { MyTeamDto } from '../../../../types'

// The caller's team roles on every owner: explicit memberships first, then the mapped ones (`source`), with each
// team's name. Works for cookie sessions and tokens with `teams` / `teams:read`.
export default defineEventHandler(async (event): Promise<MyTeamDto[]> => {
  const principal = await authorize(event, teamsAccess.permissions.read)
  const grants = await resolveAllTeamRoles(event, principal.user.id)
  if (!grants.length) return []
  const rows = await db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams)
    .where(inArray(schema.teams.id, grants.map(grant => grant.teamId)))
  const names = new Map(rows.map(row => [row.id, row.name]))
  return grants.map(grant => ({ ...grant, name: names.get(grant.teamId) ?? grant.teamId }))
})
