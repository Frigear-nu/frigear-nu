import { idParams, validationError } from '@frigear-nu/module-kit/server'
import type { PlaneFeatureCollection } from '@frigear-nu/maps/utils'
import { operationsAccess } from '../../../access'
import { OPERATIONS_VENUE_KINDS } from '../../../utils/venue'

// Replaces the venue layout of an operation (`{ layout }`, a plane layout of `@frigear-nu/maps`). Every feature must be
// a kind a venue layout may hold, with properties its kind's schema accepts (400 with the issues otherwise). The
// underlay is the server's: it stays unless the layout sends `underlay: null`, which removes the image.
export default defineEventHandler(async (event): Promise<PlaneFeatureCollection> => {
  await authorize(event, operationsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const body = await readValidatedBody(event, operationVenueLayoutInput.parse)
  const check = validatePlaneLayout(body.layout, { kinds: OPERATIONS_VENUE_KINDS })
  if (!check.success) throw validationError(check.issues.map(issue => ({ ...issue, path: ['layout', ...issue.path] })))
  const existing = await getOperationOr404(id)
  await authorize(event, operationsAccess.permissions.manage, existing)
  const { row, removed } = await saveOperationVenueLayout(existing, check.data)
  if (removed) await deleteMapUnderlay(removed)
  return toOperationVenueLayoutDto(row)
})
