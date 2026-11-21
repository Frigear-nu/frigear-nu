import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftStationDto } from '../../../../types'

// A schedule's check-in stations. Staff.
export default defineEventHandler(async (event): Promise<ShiftStationDto[]> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { scheduleId } = await getValidatedRouterParams(event, idParams('scheduleId').parse)
  const schedule = await getShiftScheduleOr404(scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  return shiftsListStations(schedule.id)
})
