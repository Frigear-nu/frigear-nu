import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftSwapDto } from '../../../../types'

// The swaps of a team (`?status`, e.g. `pending_approval`): of its shifts, or giving one of its shifts back. For a lead
// of the team, or staff. Names only.
export default defineEventHandler(async (event): Promise<ShiftSwapDto[]> => {
  await authorize(event, shiftsAccess.permissions.lead)
  const { teamId } = await getValidatedRouterParams(event, idParams('teamId').parse)
  const { status } = await getValidatedQuery(event, shiftsTeamSwapsQuery.parse)
  await authorize(event, shiftsAccess.permissions.lead, { teamId })
  return shiftsTeamSwaps(teamId, status)
})
