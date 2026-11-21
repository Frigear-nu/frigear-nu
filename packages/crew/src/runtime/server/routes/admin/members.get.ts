import { idParams } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewMemberDto } from '../../../../types'

// An operation's whole crew, one page (`?status&team&previous&q&sort&order&page&pageSize`), for staff with `crew:manage`.
// Emails, phone numbers and the email search need `crew:pii`. Team leads read their own teams from
// `GET /api/crew/operations/:operationId/members`.
export default defineEventHandler(async (event): Promise<Page<CrewMemberDto>> => {
  await authorize(event, crewAccess.permissions.manage)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const query = await getValidatedQuery(event, crewMembersQuery.parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, crewAccess.permissions.manage, operation)
  return crewMembersPage(operation, query, { pii: await allows(event, crewAccess.permissions.pii) })
})
