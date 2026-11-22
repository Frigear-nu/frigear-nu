import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftSwapDto } from '../../../../types'

// Cancels a live swap (staff). An `accepted` swap, being carried out or stuck after a failed exchange, is settled:
// completed when both shifts moved, put back to the people who held them when only one moved, else cancelled.
export default defineEventHandler(async (event): Promise<ShiftSwapDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { swapId } = await getValidatedRouterParams(event, idParams('swapId').parse)
  const swap = await getShiftSwapOr404(swapId)
  const owner = await getShiftAssignmentEntryOr404(swap.assignmentId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: owner.schedule.operationId })
  return shiftsCancelSwap(swap)
})
