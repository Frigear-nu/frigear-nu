import { created, idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftSwapOfferDto } from '../../../../types'

// Offers on a swap: one of my own shifts in return on a trade (`{ assignmentId }`, required: 409 `handover_not_allowed`
// without), nothing on a release. The schedule must allow it now (409 `handover_not_allowed`). Both people must be
// eligible for the shift they get, and no guard may break (409 `guard_*`). Fires `shifts:swap:offered` and emails the owner.
export default defineEventHandler(async (event): Promise<ShiftSwapOfferDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.swap)
  const { swapId } = await getValidatedRouterParams(event, idParams('swapId').parse)
  const input = await readValidatedBody(event, shiftsOfferInput.parse)
  const userId = Number(principal.user.id)
  const swap = await getShiftSwapOr404(swapId)
  // The offer is the caller's own: they give their own shift (if any) and take the swap's.
  await authorize(event, shiftsAccess.permissions.swap, { userId })
  return created(event, await shiftsOffer(event, swap, userId, input.assignmentId ?? null))
})
