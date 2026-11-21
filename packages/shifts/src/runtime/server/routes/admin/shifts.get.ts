import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftWithAssigneesDto } from '../../../../types'

// A schedule's shifts (`?teamId&from&to`) with who works them, draft or published. Staff; email and phone number only
// with `shifts:pii`.
export default defineEventHandler(async (event): Promise<ShiftWithAssigneesDto[]> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { scheduleId } = await getValidatedRouterParams(event, idParams('scheduleId').parse)
  const query = await getValidatedQuery(event, shiftsRangeQuery.parse)
  const schedule = await getShiftScheduleOr404(scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  return shiftsScheduleShifts(schedule, query, await allows(event, shiftsAccess.permissions.pii))
})
