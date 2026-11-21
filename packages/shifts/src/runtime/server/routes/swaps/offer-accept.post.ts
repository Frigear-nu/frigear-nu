import { shiftsAccess } from '../../../access'
import type { ShiftSwapDto } from '../../../../types'

// The swap's owner accepts an offer. `peer` mode: the two shifts change hands at once (`completed`). `approval` mode:
// the swap waits for a lead of the team(s) or staff (`pending_approval`). Two accepts at once carry out one (409
// `swap_changed`). Fires `shifts:swap:accepted` (and `shifts:swap:completed`) and emails the people involved.
export default defineEventHandler(async (event): Promise<ShiftSwapDto> => {
  await authorize(event, shiftsAccess.permissions.swap)
  const { swapId, offerId } = await getValidatedRouterParams(event, shiftsOfferParams.parse)
  const swap = await getShiftSwapOr404(swapId)
  const offer = await getShiftSwapOfferOr404(swap.id, offerId)
  await authorize(event, shiftsAccess.permissions.swap, { userId: shiftsSwapOwnerId(swap) })
  return shiftsAcceptOffer(event, swap, offer)
})
