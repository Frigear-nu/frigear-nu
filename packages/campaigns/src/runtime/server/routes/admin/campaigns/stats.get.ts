import { idParams } from '@frigear-nu/module-kit/server'
import type { CampaignStatsDto } from '../../../../../types'
import { campaignsAccess } from '../../../../access'

// `GET /api/admin/campaigns/:id/stats` (`campaigns:manage`): counts per channel (sent, skipped, failed, opened, clicked)
// and clicks per link. No recipient is named.
export default defineEventHandler(async (event): Promise<CampaignStatsDto> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getCampaignOr404(id)
  await authorize(event, campaignsAccess.permissions.manage, row)
  return campaignStats(row)
})
