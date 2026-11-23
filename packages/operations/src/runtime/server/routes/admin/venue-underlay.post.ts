import { idParams } from '@frigear-nu/module-kit/server'
import type { OperationVenueUnderlayDto } from '../../../../types'
import { operationsAccess } from '../../../access'

// Uploads the underlay image of an operation's venue layout (multipart `file`: a PNG, JPEG or WebP, 415 otherwise; at
// most `maps.maxUnderlayBytes`, 413 above). One plane unit is one pixel. A replaced image is deleted. Answers where the
// editor loads it and the layout's new `revision`. With `?revision=` (what the client read), a layout someone changed
// since is a 409 `venue_layout_changed`, before anything is stored; the write is conditional on the layout read here,
// and the new image is deleted again when it loses a race.
export default defineEventHandler(async (event): Promise<OperationVenueUnderlayDto> => {
  await authorize(event, operationsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const { revision } = await getValidatedQuery(event, operationVenueUnderlayQuery.parse)
  const existing = await getOperationOr404(id)
  await authorize(event, operationsAccess.permissions.manage, existing)
  assertOperationVenueRevision(existing, revision)
  const stored = await storeMapUnderlay(event, { prefix: `operations/${existing.id}` })
  const { row, replaced } = await setOperationVenueUnderlay(existing, stored).catch(async (error: unknown) => {
    await deleteMapUnderlay(stored)
    throw error
  })
  if (replaced) await deleteMapUnderlay(replaced)
  const { underlay, revision: next } = toOperationAdminVenueLayoutDto(row)
  return { ...underlay!, revision: next }
})
