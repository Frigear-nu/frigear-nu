import { apiError, created, idParams, notFound } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftBroadcastResultDto } from '../../../../types'

// A lead messages their own team (`audience.teamRole` narrows it, `audience.shiftId` picks one shift of the team):
// email by default, SMS only when `channels` asks for it. 400 `audience_empty` / `audience_too_large`. Staff with
// `shifts:lead` (through `shifts:manage`) may use it for any team too; the admin route is the broader one.
export default defineEventHandler(async (event): Promise<ShiftBroadcastResultDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.lead)
  const { teamId } = await getValidatedRouterParams(event, idParams('teamId').parse)
  const input = await readValidatedBody(event, shiftsLeadBroadcastInput.parse)
  await authorize(event, shiftsAccess.permissions.lead, { teamId })
  const team = (await shiftsTeamsById([teamId])).get(teamId)
  if (!team || team.ownerType !== 'operation' || !team.ownerId) throw notFound('Team not found.')
  if (input.audience.teamId && input.audience.teamId !== teamId) throw apiError(403, 'forbidden', 'Leads message their own team only.')
  return created(event, await shiftsSendBroadcast(event, { ...input, operationId: team.ownerId, audience: { ...input.audience, teamId } }, Number(principal.user.id)))
})
