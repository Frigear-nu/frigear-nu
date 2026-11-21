import { created, idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftPerkDto } from '../../../../types'

// Adds a perk to an operation: a meal or drink voucher for one team or all of them, as an allowance per shift
// (`perShift`) or a budget per person across the operation (`perPerson`), exactly one of them.
export default defineEventHandler(async (event): Promise<ShiftPerkDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const input = await readValidatedBody(event, shiftsPerkInput.parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: operation.id })
  return created(event, toShiftPerkDto(await shiftsCreatePerk(operation.id, input), 0))
})
