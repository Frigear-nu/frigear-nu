import type { CampaignListDto } from '../../../../types'
import { campaignsAccess } from '../../../access'

// `GET /api/admin/campaigns/lists` (`campaigns:manage`): every list with its subscriber counts. A small, bounded list.
export default defineEventHandler(async (event): Promise<CampaignListDto[]> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const lists = await listCampaignLists()
  const counts = await campaignListCounts(lists.map(list => list.id))
  return lists.map(list => toCampaignListDto(list, counts.get(list.id)))
})
