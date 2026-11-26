import { idParams } from '@frigear-nu/module-kit/server'
import type { CampaignListDto } from '../../../../types'
import { campaignsAccess } from '../../../access'

// `GET /api/admin/campaigns/lists/:id` (`campaigns:manage`): one list with its subscriber counts.
export default defineEventHandler(async (event): Promise<CampaignListDto> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const list = await getCampaignListOr404(id)
  await authorize(event, campaignsAccess.permissions.manage, list)
  const counts = await campaignListCounts([list.id])
  return toCampaignListDto(list, counts.get(list.id))
})
