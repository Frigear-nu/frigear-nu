import { idParams } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewMemberDto } from '../../../../types'

// An operation's crew as the caller may read it, one page (`?status&team&previous&q&sort&order&page&pageSize`). Staff with `crew:manage` read all
// of it; anybody else reads the crew of the teams they lead, and nothing when they lead none. Emails, phone numbers and
// the email search need `crew:pii`. The staff version of this list is `GET /api/admin/crew/operations/:operationId/members`.
export default defineEventHandler(async (event): Promise<Page<CrewMemberDto>> => {
  const principal = await authorize(event, crewAccess.permissions.read)
  const { operation: operationId } = await getValidatedRouterParams(event, idParams('operation').parse)
  const query = await getValidatedQuery(event, crewMembersQuery.parse)
  const operation = await getOperationOr404(operationId)
  const pii = await allows(event, crewAccess.permissions.pii)
  const teamIds = await allows(event, crewAccess.permissions.manage) ? undefined : await crewLedTeamIds(event, Number(principal.user.id), operation.id)
  return crewMembersPage(operation, query, { teamIds, pii })
})
