import { idParams } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewSettingsDto } from '../../../../types'

// Saves how an operation's crew is recruited (the whole record). The first save also creates the default team ("Crew")
// when the operation has none, and the role mapping presets. A form must ask for a signed-in user and store its
// submissions (400), and only one operation may recruit with it (409). A bigger capacity promotes people off the
// waiting list.
export default defineEventHandler(async (event): Promise<CrewSettingsDto> => {
  await authorize(event, crewAccess.permissions.manage)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const input = await readValidatedBody(event, crewSettingsInput.parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, crewAccess.permissions.manage, operation)
  const row = await saveCrewSettings(event, operation.id, input)
  await crewPromoteWaitlist(event, operation, row)
  return crewSettingsDtoOf(operation.id)
})
