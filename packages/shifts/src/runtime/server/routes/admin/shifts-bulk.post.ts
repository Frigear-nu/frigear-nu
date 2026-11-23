import { created, idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftDto } from '../../../../types'

// Creates shifts in bulk: every slot (`HH:mm`–`HH:mm`, an end at or before the start is the next day) on every day
// (`YYYY-MM-DD`), as wall-clock times in the module's `timeZone`. Fires `shifts:shift:created` per shift.
export default defineEventHandler(async (event): Promise<ShiftDto[]> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { scheduleId } = await getValidatedRouterParams(event, idParams('scheduleId').parse)
  const input = await readValidatedBody(event, shiftsBulkInput.parse)
  const schedule = await getShiftScheduleOr404(scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  return created(event, await shiftsBulkCreate(event, schedule, input))
})
