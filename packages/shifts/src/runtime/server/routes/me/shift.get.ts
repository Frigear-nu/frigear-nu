import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { MyShiftDetailDto } from '../../../../types'

// One of my shifts: the shift, the leads of the team on duty with me (names only), my live swap with its offers and when
// the QR pass shows. Another person's assignment, or one in a draft schedule, is a 404 here.
export default defineEventHandler(async (event): Promise<MyShiftDetailDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.read)
  const { assignmentId } = await getValidatedRouterParams(event, idParams('assignmentId').parse)
  const entry = await getShiftAssignmentEntryOr404(assignmentId)
  if (entry.assignment.userId !== Number(principal.user.id) || entry.schedule.status !== 'published') throw notFound('Assignment not found.')
  await authorize(event, shiftsAccess.permissions.read, { userId: entry.assignment.userId, teamId: entry.shift.teamId })
  return shiftsMyShiftDetail(event, entry)
})
