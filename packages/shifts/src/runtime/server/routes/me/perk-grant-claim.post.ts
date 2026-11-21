import { idParams } from '@frigear-nu/module-kit/server'
import { perksAccess } from '../../../access'
import type { ShiftPerkGrantDto } from '../../../../types'

// Claims one of my perk grants (`{ client? }`), idempotently: a repeat answers the same `claimedAt`. Somebody else's
// grant is a 404 like an unknown one; a revoked one a 409 `grant_revoked`. `perks:claim` (the `perks` scope).
export default defineEventHandler(async (event): Promise<ShiftPerkGrantDto> => {
  const principal = await authorize(event, perksAccess.permissions['perks:claim'])
  const { grantId } = await getValidatedRouterParams(event, idParams('grantId').parse)
  const { client } = await readValidatedBody(event, shiftsPerkClaimInput.parse)
  const grant = await shiftsMyPerkGrantOr404(Number(principal.user.id), grantId)
  await authorize(event, perksAccess.permissions['perks:claim'], { userId: grant.userId })
  return shiftsClaimPerkGrant(grant, client, shiftsRequestLocale(event))
})
