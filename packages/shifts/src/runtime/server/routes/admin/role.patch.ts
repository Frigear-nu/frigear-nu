import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftRoleDto } from '../../../../types'

// Renames a shift role or changes its minimum team role. Existing assignments stay; new ones are checked against it.
export default defineEventHandler(async (event): Promise<ShiftRoleDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { roleId } = await getValidatedRouterParams(event, idParams('roleId').parse)
  const patch = await readValidatedBody(event, shiftsRolePatch.parse)
  const role = await getShiftRoleOr404(roleId)
  const schedule = await getShiftScheduleOr404(role.scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  return toShiftRoleDto(await shiftsPatchRole(event, role, patch))
})
