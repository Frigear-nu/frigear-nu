import { idParams } from '@frigear-nu/module-kit/server'
import { operationsAccess } from '../../../access'
import type { AdminOperationDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<AdminOperationDto> => {
  await authorize(event, operationsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getOperationOr404(id)
  await authorize(event, operationsAccess.permissions.manage, row)
  return toAdminOperationDto(row)
})
