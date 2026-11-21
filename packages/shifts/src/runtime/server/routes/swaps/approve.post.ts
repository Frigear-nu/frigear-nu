import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftSwapDto } from '../../../../types'

// Approves a swap waiting for approval (`approval` mode): a lead of the swap's team or of the team of the shift given
// back, or staff. The exchange is checked again and carried out. Fires `shifts:swap:completed`.
export default defineEventHandler(async (event): Promise<ShiftSwapDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.lead)
  const { swapId } = await getValidatedRouterParams(event, idParams('swapId').parse)
  const swap = await getShiftSwapOr404(swapId)
  await shiftsAuthorizeSwapApprover(event, swap)
  return shiftsApproveSwap(event, swap, Number(principal.user.id))
})
