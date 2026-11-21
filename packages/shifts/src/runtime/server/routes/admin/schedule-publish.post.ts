import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftScheduleDto } from '../../../../types'

// Publishes a draft schedule: volunteers see their shifts and can swap them. Publishing again is a no-op. Fires
// `shifts:schedule:published` once.
export default defineEventHandler(async (event): Promise<ShiftScheduleDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { scheduleId } = await getValidatedRouterParams(event, idParams('scheduleId').parse)
  const schedule = await getShiftScheduleOr404(scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  return toShiftScheduleDto(await shiftsPublishSchedule(event, schedule))
})
