import { idParams } from '@frigear-nu/module-kit/server'
import type { CampaignDto } from '../../../../../types'
import { campaignsAccess } from '../../../../access'

// `GET /api/admin/campaigns/:id` (`campaigns:manage`).
export default defineEventHandler(async (event): Promise<CampaignDto> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getCampaignOr404(id)
  await authorize(event, campaignsAccess.permissions.manage, row)
  return toCampaignDto(row)
})
