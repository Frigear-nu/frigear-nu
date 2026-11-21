import { forbidden, idParams } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../access'
import type { TeamMemberDto } from '../../../types'

// A team's members, for its members and staff: names and avatars; emails only with `teams:pii` (a sensitive
// permission no wildcard covers); the membership `status` only for staff and the team's leads. `?include=mapped` adds
// the members a mapping rule gives a role, resolved on demand: staff (`teams:manage`) and leads (`teams:lead` on the
// team) only, since it checks every candidate.
export default defineEventHandler(async (event): Promise<TeamMemberDto[]> => {
  await authorize(event, teamsAccess.permissions.read)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const query = await getValidatedQuery(event, teamMembersQuery.parse)
  const team = await getTeamOr404(id)
  await authorize(event, teamsAccess.permissions.read, team)
  const oversees = await allows(event, teamsAccess.permissions.manage) || await allows(event, teamsAccess.permissions.lead, team)
  const mapped = query.include === 'mapped'
  if (mapped && !oversees) throw forbidden('Listing mapped members needs teams:manage, or a lead role on the team.')
  const pii = await allows(event, teamsAccess.permissions.pii)
  return teamMembers(event, team.id, { mapped, pii, status: oversees })
})
