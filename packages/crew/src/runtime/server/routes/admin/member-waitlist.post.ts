import { idParams } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewMemberDto } from '../../../../types'

// Puts a person on the waiting list, last in line. Fires `crew:member:waitlisted` and emails the person.
export default defineEventHandler(async (event): Promise<CrewMemberDto> => {
  const principal = await authorize(event, crewAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const entry = await getCrewEntryOr404(id)
  await authorize(event, crewAccess.permissions.manage, { userId: entry.member.userId, teamId: entry.team.id })
  return crewMemberResponse(event, await crewDecide(event, id, 'waitlisted', { by: Number(principal.user.id) }))
})
