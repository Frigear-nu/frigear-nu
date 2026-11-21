import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftPassDto } from '../../../../types'

// The QR pass of one of my shifts. The code (and the QR code as SVG) is in it only from `checkInOpensMinutes` before the
// shift starts until it ends, and only while the assignment holds a place; otherwise `available: false` with the window.
export default defineEventHandler(async (event): Promise<ShiftPassDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.read)
  const { assignmentId } = await getValidatedRouterParams(event, idParams('assignmentId').parse)
  const entry = await getShiftAssignmentEntryOr404(assignmentId)
  if (entry.assignment.userId !== Number(principal.user.id) || entry.schedule.status !== 'published') throw notFound('Assignment not found.')
  await authorize(event, shiftsAccess.permissions.read, { userId: entry.assignment.userId })
  setResponseHeader(event, 'cache-control', 'no-store')
  return shiftsPassOf(event, entry)
})
