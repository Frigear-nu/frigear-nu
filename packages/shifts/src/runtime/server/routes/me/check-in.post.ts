import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftSelfCheckInDto } from '../../../../types'

// I check in on one of my shifts myself: the token of my team's station QR code (`mode: 'station'`), or my position
// (`mode: 'location'`). Only for a mode the schedule (or my team's override) has on. Somebody else's assignment, or one
// of a draft schedule, is a 404. A second check-in answers `alreadyCheckedIn`. `mode: 'station'` without a station key
// (`NUXT_SHIFTS_STATION_KEY`) is a 501 `not_configured`.
export default defineEventHandler(async (event): Promise<ShiftSelfCheckInDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.attend)
  const { assignmentId } = await getValidatedRouterParams(event, idParams('assignmentId').parse)
  const input = await readValidatedBody(event, shiftsSelfCheckInInput.parse)
  const entry = await getShiftAssignmentEntryOr404(assignmentId)
  if (entry.assignment.userId !== Number(principal.user.id) || entry.schedule.status !== 'published') throw notFound('Assignment not found.')
  await authorize(event, shiftsAccess.permissions.attend, { userId: entry.assignment.userId })
  return shiftsSelfCheckIn(event, entry, input)
})
