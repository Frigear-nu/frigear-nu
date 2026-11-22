import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import { checkInRuleFor } from '../../../utils/checkin'
import type { ShiftPassDto } from '../../../../types'

// The QR pass of one of my shifts. The code (and the QR code as SVG) is in it only from `checkInOpensMinutes` before the
// shift starts until it ends, and only while the assignment holds a place and I still hold my role on the team;
// otherwise `available: false` with the window. Somebody found to have lost their role has their future shifts on the
// team cancelled here. The perks I may still get (and what is left of each) are always in it. Without a station key
// (`NUXT_SHIFTS_STATION_KEY`) `checkIn.modes` leaves `station` out, so the page does not offer a scan that cannot work.
export default defineEventHandler(async (event): Promise<ShiftPassDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.read)
  const { assignmentId } = await getValidatedRouterParams(event, idParams('assignmentId').parse)
  const entry = await getShiftAssignmentEntryOr404(assignmentId)
  if (entry.assignment.userId !== Number(principal.user.id) || entry.schedule.status !== 'published') throw notFound('Assignment not found.')
  await authorize(event, shiftsAccess.permissions.read, { userId: entry.assignment.userId })
  setResponseHeader(event, 'cache-control', 'no-store')
  const rule = checkInRuleFor(entry.schedule.checkIn, entry.shift.teamId)
  const checkIn = shiftsStationKeyConfigured(event) ? rule : { ...rule, modes: rule.modes.filter(mode => mode !== 'station') }
  const pass = { ...shiftsPassOf(event, entry), checkIn }
  if (pass.available && !await shiftsStillEligible(event, entry.assignment, entry.shift.teamId)) {
    await shiftsCancelFutureAssignments(event, entry.assignment.userId, entry.shift.teamId, row => shiftsStillEligible(event, row, entry.shift.teamId))
    return { ...pass, available: false, code: null, svg: null, perks: [] }
  }
  return { ...pass, perks: entry.assignment.status === 'cancelled' ? [] : await shiftsPassPerks(entry) }
})
