import { shiftsAccess } from '../../../access'
import type { ShiftBroadcastDto } from '../../../../types'

// The broadcasts of an operation (`?operationId`), newest first: what was sent, to whom (the audience) and how many.
export default defineEventHandler(async (event): Promise<ShiftBroadcastDto[]> => {
  await authorize(event, shiftsAccess.permissions.broadcast)
  const { operationId } = await getValidatedQuery(event, shiftsBroadcastsQuery.parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, shiftsAccess.permissions.broadcast, { operationId: operation.id })
  return shiftsListBroadcasts(operation.id)
})
