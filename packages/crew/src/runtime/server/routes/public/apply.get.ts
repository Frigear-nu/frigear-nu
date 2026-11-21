import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewApplyDto } from '../../../../types'

// What the apply page needs for an operation, named by its id or URL name: the slug of the form to render while
// applications are open, or why not (not open yet, closed, no form, already applied, rejected, already on a team).
// The submission itself goes through the forms API; this route never registers anybody.
export default defineEventHandler(async (event): Promise<CrewApplyDto> => {
  const principal = await authorize(event, crewAccess.permissions.apply)
  const { operation: reference } = await getValidatedRouterParams(event, idParams('operation').parse)
  const operation = await findOperationById(reference) ?? await findOperationBySlug(reference)
  if (!operation) throw notFound('Operation not found.')
  return crewApplyDto(operation, await findCrewSettings(operation.id), Number(principal.user.id))
})
