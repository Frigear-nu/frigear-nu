import { created, idParams, validationError } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewMemberDto } from '../../../../types'

// Adds a person (an existing user) to an operation's crew, approved at once, optionally on a team and role. A new crew
// member is a 201; a withdrawn or rejected person's row is reused and approved (200). A person who is applied, waitlisted
// or approved already is a 409 with their `status`. The person gets the usual approval message.
export default defineEventHandler(async (event): Promise<CrewMemberDto> => {
  const principal = await authorize(event, crewAccess.permissions.manage)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const input = await readValidatedBody(event, crewAddMemberInput.parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, crewAccess.permissions.manage, operation)
  if (!(await loadUserRefs([input.userId])).has(input.userId)) {
    throw validationError([{ path: ['userId'], message: 'There is no user with this id.' }], 'Unknown user')
  }
  const result = await crewAddMember(event, { operation, ...input, by: Number(principal.user.id) })
  const dto = await crewMemberResponse(event, result.entry)
  return result.created ? created(event, dto) : dto
})
