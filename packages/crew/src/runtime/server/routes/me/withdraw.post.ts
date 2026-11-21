import { idParams } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { MyCrewDto } from '../../../../types'

// Withdraws my application or my place in an operation's crew (`withdrawn`). An approved person gives up their role, and
// the place goes to the next person on the waiting list. 404 without an application, 409 once it is rejected or
// withdrawn already.
export default defineEventHandler(async (event): Promise<MyCrewDto> => {
  const principal = await authorize(event, crewAccess.permissions.apply)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const entry = await crewWithdraw(event, Number(principal.user.id), operationId)
  const operation = await getOperationOr404(operationId)
  return toMyCrewDto({ member: entry.member, team: { id: entry.team.id, name: entry.team.name, ownerId: entry.team.ownerId ?? null }, operation })
})
