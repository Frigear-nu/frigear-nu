import { created, idParams, validationError } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import { translate } from '../../../utils'
import type { CrewMemberDto } from '../../../../types'

// Adds a person (an existing user) to an operation's crew, approved at once, optionally on a team and role. A new crew
// member is a 201; a withdrawn or rejected person's row is reused and approved (200). A person who is applied, waitlisted
// or approved already is a 409 with their `status`. The person gets the usual approval message. With `inboxThreadId` (the
// inbox's "Add to crew") it fires `inbox:thread:linked`, which `@frigear-nu/inbox` records on the thread's audit trail
// when the caller can read the thread; without inbox nothing listens.
export default defineEventHandler(async (event): Promise<CrewMemberDto> => {
  const principal = await authorize(event, crewAccess.permissions.manage)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const input = await readValidatedBody(event, crewAddMemberInput.parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, crewAccess.permissions.manage, operation)
  if (!(await loadUserRefs([input.userId])).has(input.userId)) {
    throw validationError([{ path: ['userId'], message: 'There is no user with this id.' }], 'Unknown user')
  }
  const { inboxThreadId, ...member } = input
  const by = Number(principal.user.id)
  const result = await crewAddMember(event, { operation, ...member, by })
  const dto = await crewMemberResponse(event, result.entry)
  if (inboxThreadId) {
    // Inbox declares the hook; crew does not depend on inbox, so the name is not in crew's hook types.
    const hooks = useNitroApp().hooks as unknown as { callHook: (name: string, ctx: Record<string, unknown>) => Promise<unknown> }
    await hooks.callHook('inbox:thread:linked', {
      event,
      threadId: inboxThreadId,
      actorId: by,
      module: 'crew',
      kind: 'crew-member',
      label: translate(operation.name, 'en'),
      userId: input.userId,
    }).catch((error: unknown) => console.error('[crew] could not link the inbox thread', error))
  }
  return result.created ? created(event, dto) : dto
})
