import { idParams } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewSettingsDto } from '../../../../types'

// How an operation's crew is recruited. Without a saved row the defaults come back (`source: 'default'`).
export default defineEventHandler(async (event): Promise<CrewSettingsDto> => {
  await authorize(event, crewAccess.permissions.manage)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, crewAccess.permissions.manage, operation)
  return crewSettingsDtoOf(operation.id)
})
