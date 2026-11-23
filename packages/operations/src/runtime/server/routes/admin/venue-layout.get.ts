import { idParams } from '@frigear-nu/module-kit/server'
import type { OperationVenueLayoutDto } from '../../../../types'
import { operationsAccess } from '../../../access'

// The venue layout of an operation for the staff editor: what `PUT` saves, with the underlay's URL and the `revision` a
// change sends back (409 `venue_layout_changed` when the layout changed since).
export default defineEventHandler(async (event): Promise<OperationVenueLayoutDto> => {
  await authorize(event, operationsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getOperationOr404(id)
  await authorize(event, operationsAccess.permissions.manage, row)
  return toOperationAdminVenueLayoutDto(row)
})
