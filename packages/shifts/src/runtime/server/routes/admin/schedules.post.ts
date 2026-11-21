import { created } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftScheduleDto } from '../../../../types'

// Creates a draft schedule for an operation (400 `invalid_schedule_settings` for `coverage: 'all'` without
// `handover: 'trade'`). Volunteers see nothing of it until it is published.
export default defineEventHandler(async (event): Promise<ShiftScheduleDto> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const input = await readValidatedBody(event, shiftsScheduleInput.parse)
  const operation = await getOperationOr404(input.operationId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: operation.id })
  return created(event, toShiftScheduleDto(await shiftsCreateSchedule(input), 0))
})
