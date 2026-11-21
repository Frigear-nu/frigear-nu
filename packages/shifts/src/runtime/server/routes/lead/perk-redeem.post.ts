import { z } from 'zod'
import { shiftsAccess } from '../../../access'
import type { ShiftPerkRedeemDto } from '../../../../types'

// Redeems a perk (a meal voucher, a drink) with the code of a person's QR pass, for a team (a lead of it, or staff).
// An unknown code, a code or perk of another team: 404. 409 `perk_used_up` once the allowance is spent, `not_on_shift`,
// `assignment_cancelled`, `not_eligible` and `outside_window` as for a check-in. Does not check anyone in.
export default defineEventHandler(async (event): Promise<ShiftPerkRedeemDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.lead)
  const { teamId, perkId } = await getValidatedRouterParams(event, z.object({ teamId: z.string().trim().min(1), perkId: z.string().trim().min(1) }).parse)
  const { code } = await readValidatedBody(event, shiftsCheckInInput.parse)
  await authorize(event, shiftsAccess.permissions.lead, { teamId })
  return shiftsRedeemPerk(event, teamId, perkId, code, Number(principal.user.id))
})
