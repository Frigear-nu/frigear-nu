import type { CampaignUserLookupDto } from '../../../../../types'
import { campaignsAccess } from '../../../../access'

// `GET /api/admin/campaigns/users` (`campaigns:manage`): people for the message form's picker. `?q=` searches (at most
// 20); `?ids=1,2` names the people a draft already lists. With `campaigns:pii` the search matches emails too and the
// answer carries them; without it only names, so the search cannot be used to probe addresses.
export default defineEventHandler(async (event): Promise<CampaignUserLookupDto[]> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const { q, ids } = await getValidatedQuery(event, campaignsUserLookupQuery.parse)
  const pii = await allows(event, campaignsAccess.permissions.pii)
  const refs = ids.length ? [...(await loadUserRefs(ids)).values()] : q ? await searchUserRefs(q, { pii, limit: 20 }) : []
  return refs.map(ref => ({ id: Number(ref.id), name: ref.name, avatar: ref.avatar ?? null, ...(pii ? { email: ref.email ?? null } : {}) }))
})
