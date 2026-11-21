import { created } from '@frigear-nu/module-kit/server'
import { operationsAccess } from '../../../access'
import type { AdminOperationDto } from '../../../../types'

// Creates an operation in `planning`.
export default defineEventHandler(async (event): Promise<AdminOperationDto> => {
  await authorize(event, operationsAccess.permissions.manage)
  const input = await readValidatedBody(event, operationInput.parse)
  const operation = toAdminOperationDto(await createOperationRow(input))
  await useNitroApp().hooks.callHook('operations:created', { event, operation })
  return created(event, operation)
})
