import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'

// Deletes a schedule with its roles and shifts. 409 `schedule_in_use` while people are (or were) on its shifts.
export default defineEventHandler(async (event) => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { scheduleId } = await getValidatedRouterParams(event, idParams('scheduleId').parse)
  const schedule = await getShiftScheduleOr404(scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  await shiftsDeleteSchedule(schedule)
  return noContent(event)
})
