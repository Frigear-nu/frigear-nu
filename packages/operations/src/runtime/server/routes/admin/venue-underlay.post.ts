import { idParams } from '@frigear-nu/module-kit/server'
import type { PlaneUnderlay } from '@frigear-nu/maps/utils'
import { operationsAccess } from '../../../access'

// Uploads the underlay image of an operation's venue layout (multipart `file`: a PNG, JPEG or WebP, 415 otherwise; at
// most `maps.maxUnderlayBytes`, 413 above). One plane unit is one pixel. A replaced image is deleted. Answers where the
// editor loads it.
export default defineEventHandler(async (event): Promise<PlaneUnderlay> => {
  await authorize(event, operationsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getOperationOr404(id)
  await authorize(event, operationsAccess.permissions.manage, existing)
  const stored = await storeMapUnderlay(event, { prefix: `operations/${existing.id}` })
  const { row, replaced } = await setOperationVenueUnderlay(existing, stored)
  if (replaced) await deleteMapUnderlay(replaced)
  return toOperationVenueLayoutDto(row).underlay!
})
