import { idParams } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../access'
import type { TeamMemberDto } from '../../../types'

// A team's members, for its members and staff: names and avatars; emails only with `teams:pii` (a sensitive
// permission no wildcard covers). `?include=mapped` adds the members a mapping rule gives a role, resolved on demand.
export default defineEventHandler(async (event): Promise<TeamMemberDto[]> => {
  await authorize(event, teamsAccess.permissions.read)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const query = await getValidatedQuery(event, teamMembersQuery.parse)
  const team = await getTeamOr404(id)
  await authorize(event, teamsAccess.permissions.read, team)
  const pii = await allows(event, teamsAccess.permissions.pii)
  return teamMembers(event, team.id, { mapped: query.include === 'mapped', pii })
})
