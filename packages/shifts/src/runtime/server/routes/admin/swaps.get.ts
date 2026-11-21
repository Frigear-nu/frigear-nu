import { shiftsAccess } from '../../../access'
import type { ShiftSwapDto } from '../../../../types'

// Swaps for staff (`?operationId&status`), newest first, with their offers. The approval list of the Shifts tab reads
// `status=pending_approval`.
export default defineEventHandler(async (event): Promise<ShiftSwapDto[]> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const query = await getValidatedQuery(event, shiftsSwapsQuery.parse)
  if (query.operationId) {
    const operation = await getOperationOr404(query.operationId)
    await authorize(event, shiftsAccess.permissions.manage, { operationId: operation.id })
  }
  return shiftsAdminSwaps(query)
})
