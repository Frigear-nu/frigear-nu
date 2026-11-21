import { idParams } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewMemberDto } from '../../../../types'

// One crew member: the person themselves, the leads of their team and staff (the `crew:read` policy).
export default defineEventHandler(async (event): Promise<CrewMemberDto> => {
  await authorize(event, crewAccess.permissions.read)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const entry = await getCrewEntryOr404(id)
  await authorize(event, crewAccess.permissions.read, { userId: entry.member.userId, teamId: entry.team.id })
  return crewMemberResponse(event, entry)
})
