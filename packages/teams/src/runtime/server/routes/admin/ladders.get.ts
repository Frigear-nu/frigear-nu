import { teamsAccess } from '../../../access'
import type { TeamLadderDto } from '../../../../types'

// Every ladder: the stored ones and the module option's kinds that are not stored yet, by kind.
export default defineEventHandler(async (event): Promise<TeamLadderDto[]> => {
  await authorize(event, teamsAccess.permissions.manage)
  return Object.values(await loadTeamLadders(event)).sort((a, b) => a.kind.localeCompare(b.kind))
})
