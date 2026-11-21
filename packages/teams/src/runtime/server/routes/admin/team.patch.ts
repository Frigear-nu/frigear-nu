import { idParams } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { AdminTeamDto } from '../../../../types'

// Edits the name, description, parent, capacity and sort. The owner and kind are fixed: members' roles belong to the
// kind's ladder.
export default defineEventHandler(async (event): Promise<AdminTeamDto> => {
  await authorize(event, teamsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, teamPatchSchema.parse)
  const existing = await getTeamOr404(id)
  await authorize(event, teamsAccess.permissions.manage, existing)
  return toAdminTeamDtoOf(event, await patchTeamRow(existing, patch))
})
