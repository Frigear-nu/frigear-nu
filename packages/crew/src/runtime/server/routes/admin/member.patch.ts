import { idParams } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewMemberDto } from '../../../../types'

// Moves a crew member to another team of the operation and/or another role of that team's ladder (400 otherwise, 409
// when they are on that team already). An approved person keeps their grant; the teams member hooks fire.
export default defineEventHandler(async (event): Promise<CrewMemberDto> => {
  await authorize(event, crewAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, crewMemberPatchSchema.parse)
  const entry = await getCrewEntryOr404(id)
  await authorize(event, crewAccess.permissions.manage, { userId: entry.member.userId, teamId: entry.team.id })
  return crewMemberResponse(event, await crewMove(event, id, patch))
})
