import { idParams } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewMemberDto } from '../../../../types'

// Rejects an application (or takes an approved person off the crew, which frees a place on the waiting list). Fires
// `crew:member:rejected` and emails the person.
export default defineEventHandler(async (event): Promise<CrewMemberDto> => {
  const principal = await authorize(event, crewAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const entry = await getCrewEntryOr404(id)
  await authorize(event, crewAccess.permissions.manage, { userId: entry.member.userId, teamId: entry.team.id })
  return crewMemberResponse(event, await crewDecide(event, id, 'rejected', { by: Number(principal.user.id) }))
})
