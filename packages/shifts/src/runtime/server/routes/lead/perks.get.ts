import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftPerkDto } from '../../../../types'

// The perks a team's leads can redeem at the scanner: the operation's perks for the team, or for all teams. For a lead of
// the team, or staff.
export default defineEventHandler(async (event): Promise<ShiftPerkDto[]> => {
  await authorize(event, shiftsAccess.permissions.lead)
  const { teamId } = await getValidatedRouterParams(event, idParams('teamId').parse)
  await authorize(event, shiftsAccess.permissions.lead, { teamId })
  const team = (await shiftsTeamsById([teamId])).get(teamId)
  if (!team || team.ownerType !== 'operation' || !team.ownerId) throw notFound('Team not found.')
  return shiftsTeamPerks(team.ownerId, teamId)
})
