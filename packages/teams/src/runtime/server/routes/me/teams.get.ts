import { db, schema } from '@nuxthub/db'
import { inArray } from 'drizzle-orm'
import { inChunks } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { MyTeamDto } from '../../../../types'

// The caller's team roles on every owner: explicit memberships first, then the mapped ones (`source`), with each
// team's name and the role's ladder label. Works for cookie sessions and tokens with `teams` / `teams:read`.
export default defineEventHandler(async (event): Promise<MyTeamDto[]> => {
  const principal = await authorize(event, teamsAccess.permissions.read)
  const grants = await resolveAllTeamRoles(event, principal.user.id)
  if (!grants.length) return []
  // In chunks: D1 binds at most 100 parameters, and a user can hold a role on more teams.
  const rows = await inChunks([...new Set(grants.map(grant => grant.teamId))], ids => db.select({ id: schema.teams.id, name: schema.teams.name })
    .from(schema.teams).where(inArray(schema.teams.id, ids)))
  const names = new Map(rows.map(row => [row.id, row.name]))
  const ladders = await loadTeamLadders(event)
  const roleLabel = (kind: string, role: string) => ladders[kind]?.roles.find(item => item.key === role)?.label ?? role
  return grants.map(grant => ({ ...grant, name: names.get(grant.teamId) ?? grant.teamId, roleLabel: roleLabel(grant.kind, grant.role) }))
})
