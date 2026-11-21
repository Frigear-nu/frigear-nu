import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'

// Deletes a check-in station: its codes stop working at once. Staff.
export default defineEventHandler(async (event) => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { stationId } = await getValidatedRouterParams(event, idParams('stationId').parse)
  const station = await getShiftStationOr404(stationId)
  const schedule = await getShiftScheduleOr404(station.scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  await shiftsDeleteStation(station)
  return noContent(event)
})
