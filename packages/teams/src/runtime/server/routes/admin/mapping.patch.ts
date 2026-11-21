import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { TeamRoleMappingDto } from '../../../../types'

// Edits a rule's team, match, team role or priority. Its owner is fixed.
export default defineEventHandler(async (event): Promise<TeamRoleMappingDto> => {
  await authorize(event, teamsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, teamMappingPatchSchema.parse)
  const existing = await getTeamMappingOr404(id)
  const teamId = patch.teamId === undefined ? existing.teamId : patch.teamId ?? null
  const teamRole = patch.teamRole ?? existing.teamRole
  await assertTeamMappingTarget(event, { ownerType: existing.ownerType, ownerId: existing.ownerId ?? null, teamId, teamRole })
  const values: Partial<typeof schema.teamRoleMappings.$inferInsert> = { teamId, teamRole }
  if (patch.match !== undefined) values.match = normalizeTeamRoleMatch(patch.match)
  if (patch.priority !== undefined) values.priority = patch.priority
  const [row] = await db.update(schema.teamRoleMappings).set(values).where(eq(schema.teamRoleMappings.id, existing.id)).returning()
  return toTeamRoleMappingDto(row!)
})
