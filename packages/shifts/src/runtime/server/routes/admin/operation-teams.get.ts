import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftsOperationTeamDto } from '../../../../types'

// The teams of an operation with their kind's ladder, for the schedule forms of the Shifts tab (staff with
// `shifts:manage`, who need not hold the teams permissions).
export default defineEventHandler(async (event): Promise<ShiftsOperationTeamDto[]> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: operation.id })
  return shiftsOperationTeams(event, operation.id)
})
