import { created, idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftStationDto } from '../../../../types'

// Adds a check-in station for a team of the schedule's operation, optionally on a station of the venue layout. Staff.
export default defineEventHandler(async (event): Promise<ShiftStationDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { scheduleId } = await getValidatedRouterParams(event, idParams('scheduleId').parse)
  const input = await readValidatedBody(event, shiftsStationInput.parse)
  const schedule = await getShiftScheduleOr404(scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  return created(event, toShiftStationDto(await shiftsCreateStation(schedule, input)))
})
