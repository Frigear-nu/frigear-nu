import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftRoleDto } from '../../../../types'

// The shift roles of a schedule. Staff.
export default defineEventHandler(async (event): Promise<ShiftRoleDto[]> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { scheduleId } = await getValidatedRouterParams(event, idParams('scheduleId').parse)
  const schedule = await getShiftScheduleOr404(scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  return shiftsListRoles(schedule.id)
})
