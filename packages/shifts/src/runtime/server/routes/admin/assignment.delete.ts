import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'

// Cancels an assignment (an attended one cannot be). Its swap is cancelled. Fires `shifts:assignment:changed`.
export default defineEventHandler(async (event) => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { assignmentId } = await getValidatedRouterParams(event, idParams('assignmentId').parse)
  const entry = await getShiftAssignmentEntryOr404(assignmentId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: entry.schedule.operationId })
  await shiftsCancelAssignment(event, entry)
  return noContent(event)
})
