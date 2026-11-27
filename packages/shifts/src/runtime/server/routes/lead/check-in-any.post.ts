import { notFound } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftCheckInDto } from '../../../../types'

// Checks a person in with the code of their QR pass on any shift, without picking a team first: a holder of
// `shifts:checkin` checks in anyone, a lead (or staff) the people of their own teams. An unknown code, or one of a team
// the caller may not check in on, is a 404 (nothing leaks about the code). Otherwise like the team scanner: 409
// `outside_window`, `assignment_cancelled` or `not_eligible`, and a second scan reports `alreadyCheckedIn`.
export default defineEventHandler(async (event): Promise<ShiftCheckInDto> => {
  const principal = await requireAuth(event)
  const anyShift = await allows(event, shiftsAccess.permissions.checkin)
  // Without `shifts:checkin`, the caller must at least lead some team (a token needs `shifts:lead`).
  if (!anyShift) await authorize(event, shiftsAccess.permissions.lead)
  const { code } = await readValidatedBody(event, shiftsCheckInInput.parse)
  const entry = await shiftsAssignmentByCode(code)
  if (!entry) throw notFound('Unknown check-in code.')
  if (!anyShift && !await allows(event, shiftsAccess.permissions.lead, { teamId: entry.shift.teamId })) throw notFound('Unknown check-in code.')
  return shiftsCheckIn(event, code, Number(principal.user.id), await allows(event, shiftsAccess.permissions.pii), { entry })
})
