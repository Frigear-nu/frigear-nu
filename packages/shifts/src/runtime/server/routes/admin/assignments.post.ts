import { created, idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftAssignResultDto } from '../../../../types'

// Assigns a person to a shift (`{ userId, shiftRoleId?, force? }`). They must hold an explicit role on the shift's team
// that meets the shift role (409 `not_eligible`). A full shift is a 409 `shift_full` unless `force`. The guards come
// back as `warnings` and never block. Fires `shifts:assignment:changed` with `previous: null`.
export default defineEventHandler(async (event): Promise<ShiftAssignResultDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.manage)
  const { shiftId } = await getValidatedRouterParams(event, idParams('shiftId').parse)
  const input = await readValidatedBody(event, shiftsAssignInput.parse)
  const entry = await getShiftEntryOr404(shiftId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: entry.schedule.operationId })
  const pii = await allows(event, shiftsAccess.permissions.pii)
  return created(event, await shiftsAssign(event, entry, input, Number(principal.user.id), pii))
})
