import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftPassDto } from '../../../../types'

// Settles one of my shifts after its pass said `eligible: false` (I no longer hold a role on its team): my future shifts
// on the team that my role no longer meets are cancelled, and the pass is answered as `GET .../pass` would now. The GET
// itself never changes anything. Somebody else's assignment, or one of a draft schedule, is a 404.
export default defineEventHandler(async (event): Promise<ShiftPassDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.attend)
  const { assignmentId } = await getValidatedRouterParams(event, idParams('assignmentId').parse)
  const entry = await getShiftAssignmentEntryOr404(assignmentId)
  if (entry.assignment.userId !== Number(principal.user.id) || entry.schedule.status !== 'published') throw notFound('Assignment not found.')
  await authorize(event, shiftsAccess.permissions.attend, { userId: entry.assignment.userId })
  setResponseHeader(event, 'cache-control', 'no-store')
  if (!await shiftsStillEligible(event, entry.assignment, entry.shift.teamId)) {
    await shiftsCancelFutureAssignments(event, entry.assignment.userId, entry.shift.teamId, row => shiftsStillEligible(event, row, entry.shift.teamId))
  }
  return shiftsPassDto(event, await getShiftAssignmentEntryOr404(assignmentId))
})
