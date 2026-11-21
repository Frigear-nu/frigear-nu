import { shiftsAccess } from '../../../access'
import type { ShiftSwapOfferDto } from '../../../../types'

// The swap's owner turns an offer down. Fires `shifts:swap:rejected` and emails the offerer.
export default defineEventHandler(async (event): Promise<ShiftSwapOfferDto> => {
  await authorize(event, shiftsAccess.permissions.swap)
  const { swapId, offerId } = await getValidatedRouterParams(event, shiftsOfferParams.parse)
  const swap = await getShiftSwapOr404(swapId)
  const offer = await getShiftSwapOfferOr404(swap.id, offerId)
  await authorize(event, shiftsAccess.permissions.swap, { userId: shiftsSwapOwnerId(swap) })
  return shiftsRejectOffer(event, swap, offer)
})
