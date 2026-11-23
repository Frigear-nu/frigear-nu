import { teamsAccess } from '../../../access'
import type { TeamUserLookupDto } from '../../../../types'

// Finds users to add as members (at most 20). Staff only. With `teams:pii` it matches the name or the email and
// answers with the emails; without it, it matches the name only, so the search cannot be used to probe addresses.
export default defineEventHandler(async (event): Promise<TeamUserLookupDto[]> => {
  await authorize(event, teamsAccess.permissions.manage)
  const { q } = await getValidatedQuery(event, teamUserLookupQuery.parse)
  const pii = await allows(event, teamsAccess.permissions.pii)
  const refs = await searchUserRefs(q, { pii, limit: 20 })
  return refs.map(ref => ({
    id: ref.id,
    name: ref.name,
    avatar: ref.avatar,
    ...(pii ? { email: ref.email } : {}),
  }))
})
