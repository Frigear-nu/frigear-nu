import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftPerkDto } from '../../../../types'

// Changes a perk. Grants made before keep their voucher type and quantity.
export default defineEventHandler(async (event): Promise<ShiftPerkDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { perkId } = await getValidatedRouterParams(event, idParams('perkId').parse)
  const patch = await readValidatedBody(event, shiftsPerkPatch.parse)
  const perk = await getShiftPerkOr404(perkId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: perk.operationId })
  return toShiftPerkDto(await shiftsPatchPerk(perk, patch))
})
