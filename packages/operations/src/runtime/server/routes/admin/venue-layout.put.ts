import { idParams, validationError } from '@frigear-nu/module-kit/server'
import type { OperationVenueLayoutDto } from '../../../../types'
import { operationsAccess } from '../../../access'
import { OPERATIONS_VENUE_KINDS } from '../../../utils/venue'

// Replaces the venue layout of an operation (`{ layout }`, a plane layout of `@frigear-nu/maps`). Every feature must be
// a kind a venue layout may hold, with properties its kind's schema accepts (400 with the issues otherwise). The
// underlay is the server's: it stays unless the layout sends `underlay: null`, which removes the image. With the
// `revision` the client read (`GET`), a layout someone changed since is not overwritten: 409 `venue_layout_changed`. The
// write itself is conditional on the layout read here, so a concurrent save or upload is never lost either.
export default defineEventHandler(async (event): Promise<OperationVenueLayoutDto> => {
  await authorize(event, operationsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const body = await readValidatedBody(event, operationVenueLayoutInput.parse)
  const check = validatePlaneLayout(body.layout, { kinds: OPERATIONS_VENUE_KINDS })
  if (!check.success) throw validationError(check.issues.map(issue => ({ ...issue, path: ['layout', ...issue.path] })))
  const existing = await getOperationOr404(id)
  await authorize(event, operationsAccess.permissions.manage, existing)
  assertOperationVenueRevision(existing, body.revision)
  const { row, removed } = await saveOperationVenueLayout(existing, check.data)
  if (removed) await deleteMapUnderlay(removed)
  return toOperationAdminVenueLayoutDto(row)
})
