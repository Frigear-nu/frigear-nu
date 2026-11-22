import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftStationDto } from '../../../../types'

// The check-in stations of a team on published schedules, so its leads can open a station's screen. A lead of the team,
// or staff.
export default defineEventHandler(async (event): Promise<ShiftStationDto[]> => {
  await authorize(event, shiftsAccess.permissions.lead)
  const { teamId } = await getValidatedRouterParams(event, idParams('teamId').parse)
  await authorize(event, shiftsAccess.permissions.lead, { teamId })
  return shiftsTeamStations(teamId)
})
