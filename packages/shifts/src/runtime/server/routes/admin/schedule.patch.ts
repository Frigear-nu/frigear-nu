import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftScheduleDto } from '../../../../types'

// Changes a schedule's name, swap mode, sizes or guards. Publishing has its own route.
export default defineEventHandler(async (event): Promise<ShiftScheduleDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { scheduleId } = await getValidatedRouterParams(event, idParams('scheduleId').parse)
  const patch = await readValidatedBody(event, shiftsSchedulePatch.parse)
  const schedule = await getShiftScheduleOr404(scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  return toShiftScheduleDto(await shiftsPatchSchedule(schedule, patch))
})
