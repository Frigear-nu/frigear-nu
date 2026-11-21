import { idParams, noContent, notFound } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'

// Withdraws the live swap of one of my shifts: it is cancelled and its offers are not chosen. 404 without one.
export default defineEventHandler(async (event) => {
  const principal = await authorize(event, shiftsAccess.permissions.swap)
  const { assignmentId } = await getValidatedRouterParams(event, idParams('assignmentId').parse)
  const entry = await getShiftAssignmentEntryOr404(assignmentId)
  if (entry.assignment.userId !== Number(principal.user.id)) throw notFound('Assignment not found.')
  await authorize(event, shiftsAccess.permissions.swap, { userId: entry.assignment.userId })
  await shiftsWithdrawSwap(entry)
  return noContent(event)
})
