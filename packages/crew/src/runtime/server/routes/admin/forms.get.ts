import { crewAccess } from '../../../access'
import type { CrewFormOptionDto } from '../../../../types'

// The forms an operation can recruit with: not archived, asking for a signed-in user, storing their submissions, and not
// used by another operation's crew. `?operationId=` keeps the form that operation uses already in the list.
export default defineEventHandler(async (event): Promise<CrewFormOptionDto[]> => {
  await authorize(event, crewAccess.permissions.manage)
  const { operationId } = getQuery(event) as { operationId?: string }
  return crewEligibleForms(typeof operationId === 'string' && operationId ? operationId : undefined)
})
