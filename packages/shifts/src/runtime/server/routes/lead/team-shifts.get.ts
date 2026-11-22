import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftWithAssigneesDto } from '../../../../types'

// A team's shifts in published schedules (`?from&to`), with who works them: for a lead of the team, or staff. Names
// always; email and phone number only with `shifts:pii`.
export default defineEventHandler(async (event): Promise<ShiftWithAssigneesDto[]> => {
  await authorize(event, shiftsAccess.permissions.lead)
  const { teamId } = await getValidatedRouterParams(event, idParams('teamId').parse)
  const query = await getValidatedQuery(event, shiftsRangeQuery.parse)
  await authorize(event, shiftsAccess.permissions.lead, { teamId })
  return shiftsTeamShifts(teamId, query, await allows(event, shiftsAccess.permissions.pii))
})
