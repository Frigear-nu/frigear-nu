import { idParams } from '@frigear-nu/module-kit/server'
import type { MapLiveFeatureCollection } from '@frigear-nu/maps/utils'
import { shiftsAccess } from '../../../access'

// The `shifts.on-duty` live layer of `@frigear-nu/maps` (`module.ts`): who is on shift now, as a point per team and
// shift location on the operation's venue layout. A shift whose `location.featureId` names no feature of the layout,
// or has none, is skipped. For the same people as "on shift now" (`GET .../now`): those who take part in the operation
// and staff. Counts for everyone, the names of the leads on duty only with `shifts:pii`.
export default defineEventHandler(async (event): Promise<MapLiveFeatureCollection> => {
  await authorize(event, shiftsAccess.permissions.read)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, shiftsAccess.permissions.read, { operationId: operation.id })
  const pii = await allows(event, shiftsAccess.permissions.pii)
  return shiftsOnDutyLayer(event, operation, pii)
})
