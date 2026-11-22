import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftSwapDto } from '../../../../types'

// Approves a swap waiting for approval (`approval: 'lead'`): a lead of a team whose schedule asks for approval, or
// staff. A party of the swap (owner or offerer) never approves it unless they hold `shifts:manage` (403 `swap_party`).
// The schedule's settings of now and the exchange are checked again (409 `handover_not_allowed`, `guard_*`), and it is
// carried out. Fires `shifts:swap:completed`.
export default defineEventHandler(async (event): Promise<ShiftSwapDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.lead)
  const { swapId } = await getValidatedRouterParams(event, idParams('swapId').parse)
  const swap = await getShiftSwapOr404(swapId)
  await shiftsAuthorizeSwapApprover(event, swap, Number(principal.user.id))
  return shiftsApproveSwap(event, swap, Number(principal.user.id))
})
