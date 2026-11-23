import { perksAccess } from '../../../access'
import type { ShiftEarnedPerkListDto } from '../../../../types'

// The perks I earned (`?status=unclaimed|claimed|all`, `unclaimed` by default), oldest first, never the revoked ones.
// For the vouchers app with an OAuth token holding the `perks` scope (`perks:read`); names in the `Accept-Language`.
export default defineEventHandler(async (event): Promise<ShiftEarnedPerkListDto> => {
  const principal = await authorize(event, perksAccess.permissions['perks:read'])
  const { status } = await getValidatedQuery(event, shiftsEarnedPerksQuery.parse)
  const userId = Number(principal.user.id)
  await authorize(event, perksAccess.permissions['perks:read'], { userId })
  setResponseHeader(event, 'cache-control', 'no-store')
  return { items: await shiftsMyEarnedPerks(userId, status, shiftsRequestLocale(event)) }
})
