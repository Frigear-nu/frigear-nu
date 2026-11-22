import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftStationDto } from '../../../../types'

// Renames a check-in station or moves it to another station of the venue layout. Staff.
export default defineEventHandler(async (event): Promise<ShiftStationDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { stationId } = await getValidatedRouterParams(event, idParams('stationId').parse)
  const patch = await readValidatedBody(event, shiftsStationPatch.parse)
  const station = await getShiftStationOr404(stationId)
  const schedule = await getShiftScheduleOr404(station.scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  return toShiftStationDto(await shiftsPatchStation(station, schedule, patch))
})
