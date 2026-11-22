import { notFound } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { TeamLadderDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<TeamLadderDto> => {
  await authorize(event, teamsAccess.permissions.manage)
  const { kind } = await getValidatedRouterParams(event, teamLadderParams.parse)
  const ladder = (await loadTeamLadders(event))[kind]
  if (!ladder) throw notFound('There is no ladder for this team kind.')
  return ladder
})
