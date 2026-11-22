import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftPassDto } from '../../../../types'

// The QR pass of one of my shifts. The code (and the QR code as SVG) is in it only from `checkInOpensMinutes` before the
// shift starts until it ends, and only while the assignment holds a place and I still hold my role on the team;
// otherwise `available: false` with the window. Read-only: somebody found to have lost their role gets
// `eligible: false`, and `POST .../settle` cancels their future shifts on the team. The perks I may still get (and what
// is left of each) are in it while I hold my role. Without a station key (`NUXT_SHIFTS_STATION_KEY`) `checkIn.modes`
// leaves `station` out, so the page does not offer a scan that cannot work.
export default defineEventHandler(async (event): Promise<ShiftPassDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.read)
  const { assignmentId } = await getValidatedRouterParams(event, idParams('assignmentId').parse)
  const entry = await getShiftAssignmentEntryOr404(assignmentId)
  if (entry.assignment.userId !== Number(principal.user.id) || entry.schedule.status !== 'published') throw notFound('Assignment not found.')
  await authorize(event, shiftsAccess.permissions.read, { userId: entry.assignment.userId })
  setResponseHeader(event, 'cache-control', 'no-store')
  return shiftsPassDto(event, entry)
})
