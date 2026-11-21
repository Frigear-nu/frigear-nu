import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftExceptionDto } from '../../../../types'

// What a team's leads should look at on the shifts that started and ended at most a day ago: no-shows, late check-ins,
// people not checked in after the start, and no-shows whose perk was claimed. A lead of the team, or staff.
export default defineEventHandler(async (event): Promise<ShiftExceptionDto[]> => {
  await authorize(event, shiftsAccess.permissions.lead)
  const { teamId } = await getValidatedRouterParams(event, idParams('teamId').parse)
  await authorize(event, shiftsAccess.permissions.lead, { teamId })
  return shiftsTeamExceptions(teamId, await allows(event, shiftsAccess.permissions.pii))
})
