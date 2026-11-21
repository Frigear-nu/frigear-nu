import { created, idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftPerkDto } from '../../../../types'

// Adds a perk to an operation, for one team or all of them: every attended shift earns `quantity` of `voucherType`.
export default defineEventHandler(async (event): Promise<ShiftPerkDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const input = await readValidatedBody(event, shiftsPerkInput.parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: operation.id })
  return created(event, toShiftPerkDto(await shiftsCreatePerk(operation.id, input), 0))
})
