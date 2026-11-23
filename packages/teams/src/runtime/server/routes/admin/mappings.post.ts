import { db, schema } from '@nuxthub/db'
import { created } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import { newId } from '../../../utils'
import type { TeamRoleMappingDto } from '../../../../types'

// Adds a role mapping rule: users who meet `match` (`{ role }` a global role, `{ plan }` an active subscription) hold
// `teamRole` on one team of the owner (`teamId`) or on every team of the owner. Resolved at read time, never stored
// per user.
export default defineEventHandler(async (event): Promise<TeamRoleMappingDto> => {
  await authorize(event, teamsAccess.permissions.manage)
  const input = await readValidatedBody(event, teamMappingInput.parse)
  const owner = { ownerType: input.ownerType, ownerId: input.ownerId ?? null }
  await assertTeamsOwner(event, owner)
  await assertTeamMappingTarget(event, { ...owner, teamId: input.teamId ?? null, teamRole: input.teamRole })
  const [row] = await db.insert(schema.teamRoleMappings).values({
    id: newId('trm'),
    ...owner,
    teamId: input.teamId ?? null,
    match: normalizeTeamRoleMatch(input.match),
    teamRole: input.teamRole,
    priority: input.priority ?? 0,
  }).returning()
  return created(event, toTeamRoleMappingDto(row!))
})
