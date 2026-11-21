import { idParams } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewMemberDto } from '../../../../types'

// Approves an application, optionally into another team of the operation and role of its ladder: the person holds the
// role from now on. Approving someone who is approved already is a no-op; a status that cannot become approved is a 409.
// Fires `crew:member:approved` (and the teams member hooks) and emails the person.
export default defineEventHandler(async (event): Promise<CrewMemberDto> => {
  const principal = await authorize(event, crewAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, crewApproveInput.parse)
  const entry = await getCrewEntryOr404(id)
  await authorize(event, crewAccess.permissions.manage, { userId: entry.member.userId, teamId: entry.team.id })
  return crewMemberResponse(event, await crewDecide(event, id, 'approved', { by: Number(principal.user.id), ...input }))
})
