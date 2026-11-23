import { helpCenterAccess } from '../../../access'
import type { HelpUserLookupDto } from '../../../../types'

// Finds people for the send form's picker (at most 20). Needs `help-center:send`. With `help-center:pii` it matches the
// name or the email and answers with the emails; without it, it matches the name only, so the search cannot be used to
// probe addresses.
export default defineEventHandler(async (event): Promise<HelpUserLookupDto[]> => {
  await authorize(event, helpCenterAccess.permissions.send)
  const { q } = await getValidatedQuery(event, helpUserLookupQuery.parse)
  const pii = await allows(event, helpCenterAccess.permissions.pii)
  const refs = await searchUserRefs(q, { pii, limit: 20 })
  return refs.map(ref => toHelpUserLookupDto(ref, pii))
})
