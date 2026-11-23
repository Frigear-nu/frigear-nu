import { idParams } from '@frigear-nu/module-kit/server'
import { perksAccess } from '../../../access'
import type { ShiftEarnedPerkDto } from '../../../../types'

// Claims one of my earned perks (`{ client? }`), idempotently: a repeat answers the same `claimedAt`. Somebody else's
// earned perk is a 404 like an unknown one; a revoked one a 409 `perk_revoked`. `perks:claim` (the `perks` scope).
export default defineEventHandler(async (event): Promise<ShiftEarnedPerkDto> => {
  const principal = await authorize(event, perksAccess.permissions['perks:claim'])
  const { earnedPerkId } = await getValidatedRouterParams(event, idParams('earnedPerkId').parse)
  const { client } = await readValidatedBody(event, shiftsPerkClaimInput.parse)
  const earned = await shiftsMyEarnedPerkOr404(Number(principal.user.id), earnedPerkId)
  await authorize(event, perksAccess.permissions['perks:claim'], { userId: earned.userId })
  return shiftsClaimEarnedPerk(earned, client, shiftsRequestLocale(event))
})
