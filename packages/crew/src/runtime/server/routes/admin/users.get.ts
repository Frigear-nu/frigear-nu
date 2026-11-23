import { crewAccess } from '../../../access'
import type { CrewUserLookupDto } from '../../../../types'

// Finds users to add to a crew (at most 20), for the "Add crew member" picker. Staff only. With `crew:pii` it matches
// the name or the email and answers with the emails; without it, it matches the name only, so the search cannot be used
// to probe addresses.
export default defineEventHandler(async (event): Promise<CrewUserLookupDto[]> => {
  await authorize(event, crewAccess.permissions.manage)
  const { q } = await getValidatedQuery(event, crewUserLookupQuery.parse)
  const pii = await allows(event, crewAccess.permissions.pii)
  const refs = await searchUserRefs(q, { pii, limit: 20 })
  return refs.map(ref => ({ id: ref.id, name: ref.name, avatar: ref.avatar, ...(pii ? { email: ref.email } : {}) }))
})
