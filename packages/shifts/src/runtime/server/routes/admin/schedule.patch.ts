import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftScheduleDto } from '../../../../types'

// Changes a schedule's name, coverage, handover, approval, sizes or guards (400 `invalid_schedule_settings` when the
// settings merged with the stored ones do not fit together). Publishing has its own route.
export default defineEventHandler(async (event): Promise<ShiftScheduleDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { scheduleId } = await getValidatedRouterParams(event, idParams('scheduleId').parse)
  const patch = await readValidatedBody(event, shiftsSchedulePatch.parse)
  const schedule = await getShiftScheduleOr404(scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  return toShiftScheduleDto(await shiftsPatchSchedule(schedule, patch))
})
