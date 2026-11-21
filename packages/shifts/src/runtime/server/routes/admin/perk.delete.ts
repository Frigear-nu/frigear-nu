import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'

// Deletes a perk nobody earned yet: 409 `perk_has_grants` once a grant exists (change the perk instead).
export default defineEventHandler(async (event) => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { perkId } = await getValidatedRouterParams(event, idParams('perkId').parse)
  const perk = await getShiftPerkOr404(perkId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: perk.operationId })
  await shiftsDeletePerk(perk)
  return noContent(event)
})
