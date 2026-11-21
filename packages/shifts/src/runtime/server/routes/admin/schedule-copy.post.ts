import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftCopyResultDto } from '../../../../types'

// Copies another schedule's roles and shifts into this one (`{ scheduleId, offsetDays }`), the shifts moved by whole
// days at the same wall-clock time. Assignments are not copied. A schedule of another operation maps its teams by name.
export default defineEventHandler(async (event): Promise<ShiftCopyResultDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { scheduleId } = await getValidatedRouterParams(event, idParams('scheduleId').parse)
  const input = await readValidatedBody(event, shiftsCopyInput.parse)
  const schedule = await getShiftScheduleOr404(scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  const source = await findShiftSchedule(input.scheduleId)
  if (source) await authorize(event, shiftsAccess.permissions.manage, { operationId: source.operationId })
  return shiftsCopyFrom(event, schedule, input.scheduleId, input.offsetDays)
})
