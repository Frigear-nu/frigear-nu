import { created, idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftRoleDto } from '../../../../types'

// Adds a shift role to a schedule: a team of the operation and the lowest team role that may hold it (`teamRole`, on
// the team kind's ladder; empty for anybody on the team).
export default defineEventHandler(async (event): Promise<ShiftRoleDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { scheduleId } = await getValidatedRouterParams(event, idParams('scheduleId').parse)
  const input = await readValidatedBody(event, shiftsRoleInput.parse)
  const schedule = await getShiftScheduleOr404(scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  return created(event, toShiftRoleDto(await shiftsCreateRole(event, schedule, input)))
})
