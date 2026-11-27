import type { Page } from '@frigear-nu/module-kit/server'
import type { CampaignDto } from '../../../../../types'
import { campaignsAccess } from '../../../../access'

// `GET /api/admin/campaigns` (`campaigns:manage`): a page of campaigns, newest first, filtered by `status` and `kind`.
export default defineEventHandler(async (event): Promise<Page<CampaignDto>> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const query = await getValidatedQuery(event, campaignsListQuery.parse)
  return listCampaigns(query)
})
