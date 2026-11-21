import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewApplyDto } from '../../../../types'

// What the apply page needs for an operation, named by its id or URL name: the slug of the form to render while
// applications are open, or why not (not open yet, closed, no form, already applied, rejected, already on a team).
// A private operation answers 404 unless the caller may read it (`operations:read`). The submission itself goes through the
// forms API; this route never registers anybody.
export default defineEventHandler(async (event): Promise<CrewApplyDto> => {
  const principal = await authorize(event, crewAccess.permissions.apply)
  const { operation: reference } = await getValidatedRouterParams(event, idParams('operation').parse)
  const operation = await findOperationById(reference) ?? await findOperationBySlug(reference)
  // A private operation is invisible to people who may not read it, so its name and form do not leak.
  if (!operation || !await crewUserReadsOperation(event, operation, Number(principal.user.id))) throw notFound('Operation not found.')
  return crewApplyDto(operation, await findCrewSettings(operation.id), Number(principal.user.id))
})
