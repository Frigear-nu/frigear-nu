import { z } from 'zod'
import { crewAccess } from '../../../access'
import type { CrewFormOptionDto } from '../../../../types'

// An empty `operationId` is the same as none.
const querySchema = z.object({ operationId: z.string().trim().max(64).optional().transform(value => value || undefined) })

// The forms an operation can recruit with: not archived, asking for a signed-in user, storing their submissions, and not
// used by another operation's crew. `?operationId=` keeps the form that operation uses already in the list.
export default defineEventHandler(async (event): Promise<CrewFormOptionDto[]> => {
  await authorize(event, crewAccess.permissions.manage)
  const { operationId } = await getValidatedQuery(event, querySchema.parse)
  return crewEligibleForms(operationId)
})
