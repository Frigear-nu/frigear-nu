import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftPerkDto } from '../../../../types'

// An operation's perks with how many times each was redeemed. Staff.
export default defineEventHandler(async (event): Promise<ShiftPerkDto[]> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: operation.id })
  return shiftsListPerks(operation.id)
})
