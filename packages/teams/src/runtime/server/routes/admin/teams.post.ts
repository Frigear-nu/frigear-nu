import { created } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { AdminTeamDto } from '../../../../types'

// Creates a team for an owner: the platform (`ownerId: null`) or any owner `audience:owner:resolve` knows (400 when
// not). The kind must have a ladder.
export default defineEventHandler(async (event): Promise<AdminTeamDto> => {
  await authorize(event, teamsAccess.permissions.manage)
  const input = await readValidatedBody(event, teamInput.parse)
  const row = await createTeamRow(event, input)
  return created(event, await toAdminTeamDtoOf(event, row))
})
