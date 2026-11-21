import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'

// Deletes a shift. 409 `shift_in_use` while people are (or were) on it.
export default defineEventHandler(async (event) => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { shiftId } = await getValidatedRouterParams(event, idParams('shiftId').parse)
  const entry = await getShiftEntryOr404(shiftId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: entry.schedule.operationId })
  await shiftsDeleteShift(entry)
  return noContent(event)
})
