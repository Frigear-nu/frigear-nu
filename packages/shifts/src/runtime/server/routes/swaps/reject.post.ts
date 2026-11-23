import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftSwapDto } from '../../../../types'

// Rejects a swap waiting for approval: the accepted offer is rejected and the swap is open for offers again. A lead of
// a team whose schedule asks for approval, or staff; not a party of the swap (403 `swap_party`) unless staff. Fires
// `shifts:swap:rejected` and emails both people.
export default defineEventHandler(async (event): Promise<ShiftSwapDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.lead)
  const { swapId } = await getValidatedRouterParams(event, idParams('swapId').parse)
  const swap = await getShiftSwapOr404(swapId)
  await shiftsAuthorizeSwapApprover(event, swap, Number(principal.user.id))
  return shiftsRejectSwap(event, swap, Number(principal.user.id))
})
