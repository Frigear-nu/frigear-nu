import { shiftsAccess } from '../../../access'
import type { MyShiftDto } from '../../../../types'

// My shifts in published schedules, soonest first (`?from&to`, ISO instants, narrow it to shifts overlapping the range).
// Only my own: the caller is the user.
export default defineEventHandler(async (event): Promise<MyShiftDto[]> => {
  const principal = await authorize(event, shiftsAccess.permissions.read)
  const query = await getValidatedQuery(event, shiftsRangeQuery.parse)
  return shiftsMyShifts(Number(principal.user.id), query)
})
