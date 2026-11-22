import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'

// Deletes a shift role. 409 `role_in_use` while a shift or an active assignment uses it.
export default defineEventHandler(async (event) => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { roleId } = await getValidatedRouterParams(event, idParams('roleId').parse)
  const role = await getShiftRoleOr404(roleId)
  const schedule = await getShiftScheduleOr404(role.scheduleId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: schedule.operationId })
  await shiftsDeleteRole(role)
  return noContent(event)
})
