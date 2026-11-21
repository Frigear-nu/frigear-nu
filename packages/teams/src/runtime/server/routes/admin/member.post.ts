import { created, idParams } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { TeamMemberDto } from '../../../../types'

// Adds a member with a role of the team kind's ladder (400 otherwise). 409 when the user is a member already. Fires
// `teams:member:added`. An explicit membership overrides any mapped role the user had on the team.
export default defineEventHandler(async (event): Promise<TeamMemberDto> => {
  const principal = await authorize(event, teamsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, teamMemberInput.parse)
  const team = await getTeamOr404(id)
  await authorize(event, teamsAccess.permissions.manage, team)
  await assertTeamRoleOnLadder(event, team.kind, input.role)
  await assertTeamsUserExists(input.userId)
  const row = await insertTeamMemberRow({ teamId: team.id, userId: input.userId, role: input.role, status: input.status ?? null, addedBy: Number(principal.user.id) })
  forgetTeamRoles(event)
  // Listeners get the full member; the response has the email only for `teams:pii`.
  const member = await teamMemberDtoOf(row, true)
  await useNitroApp().hooks.callHook('teams:member:added', { event, team: await toAdminTeamDtoOf(event, team), member })
  return created(event, await allows(event, teamsAccess.permissions.pii) ? member : withoutTeamsEmail(member))
})
