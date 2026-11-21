import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftDto } from '../../../../types'

// Changes a shift: its times, capacity, place, notes, team or role (team and role only while nobody is on it). Fires
// `shifts:shift:updated`.
export default defineEventHandler(async (event): Promise<ShiftDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { shiftId } = await getValidatedRouterParams(event, idParams('shiftId').parse)
  const patch = await readValidatedBody(event, shiftsShiftPatch.parse)
  const entry = await getShiftEntryOr404(shiftId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: entry.schedule.operationId })
  return shiftsPatchShift(event, entry, patch)
})
