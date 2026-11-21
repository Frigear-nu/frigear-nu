import { idParams } from '@frigear-nu/module-kit/server'
import type { PlaneFeatureCollection } from '@frigear-nu/maps/utils'
import { operationsAccess } from '../../../access'

// The venue layout of an operation for the staff editor: what `PUT` saves, with the underlay's URL.
export default defineEventHandler(async (event): Promise<PlaneFeatureCollection> => {
  await authorize(event, operationsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getOperationOr404(id)
  await authorize(event, operationsAccess.permissions.manage, row)
  return toOperationVenueLayoutDto(row)
})
