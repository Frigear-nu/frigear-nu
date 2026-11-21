import { shiftsAccess } from '../../../access'
import type { ShiftScheduleDto } from '../../../../types'

// The schedules of an operation (`?operationId`), or of every operation, newest first, with their shift counts. Staff.
export default defineEventHandler(async (event): Promise<ShiftScheduleDto[]> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { operationId } = await getValidatedQuery(event, shiftsScheduleQuery.parse)
  if (operationId) {
    const operation = await getOperationOr404(operationId)
    await authorize(event, shiftsAccess.permissions.manage, { operationId: operation.id })
  }
  return shiftsListSchedules(operationId)
})
