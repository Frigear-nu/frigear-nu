import { idParams } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../access'
import type { TeamDto } from '../../../types'

// One team, for its members (explicit or mapped) and staff (`teams:read` and its policy).
export default defineEventHandler(async (event): Promise<TeamDto> => {
  await authorize(event, teamsAccess.permissions.read)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const team = await getTeamOr404(id)
  await authorize(event, teamsAccess.permissions.read, team)
  return toTeamDto(team)
})
