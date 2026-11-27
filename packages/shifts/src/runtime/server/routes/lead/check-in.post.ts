import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftCheckInDto } from '../../../../types'

// Checks a person in with the code of their QR pass (a lead of the team, or staff); `POST /api/shifts/check-in` is the
// same without picking a team first. An unknown code, or one of another
// team's shift, is a 404; outside the check-in window a 409 `outside_window`. Scanning twice reports `alreadyCheckedIn`.
// Marks the assignment `attended` and fires `shifts:attendance:marked`.
export default defineEventHandler(async (event): Promise<ShiftCheckInDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.lead)
  const { teamId } = await getValidatedRouterParams(event, idParams('teamId').parse)
  const { code } = await readValidatedBody(event, shiftsCheckInInput.parse)
  await authorize(event, shiftsAccess.permissions.lead, { teamId })
  return shiftsCheckIn(event, code, Number(principal.user.id), await allows(event, shiftsAccess.permissions.pii), { teamId })
})
