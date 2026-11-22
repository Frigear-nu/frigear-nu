import { noContent } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'

// Withdraws my offer (a waiting one, or an accepted one still waiting for approval). Only the offerer may.
export default defineEventHandler(async (event) => {
  await authorize(event, shiftsAccess.permissions.swap)
  const { swapId, offerId } = await getValidatedRouterParams(event, shiftsOfferParams.parse)
  const swap = await getShiftSwapOr404(swapId)
  const offer = await getShiftSwapOfferOr404(swap.id, offerId)
  await authorize(event, shiftsAccess.permissions.swap, { userId: offer.userId })
  await shiftsWithdrawOffer(swap, offer)
  return noContent(event)
})
