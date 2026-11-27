import { idParams } from '@frigear-nu/module-kit/server'
import type { CampaignPreviewDto } from '../../../../../types'
import { campaignsAccess } from '../../../../access'

// `GET /api/admin/campaigns/:id/preview` (`campaigns:manage`): how many recipients each channel would reach now. 400
// `audience_not_resolved` for a message whose audience lists nobody.
export default defineEventHandler(async (event): Promise<CampaignPreviewDto> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getCampaignOr404(id)
  await authorize(event, campaignsAccess.permissions.manage, row)
  return campaignsPreview(event, row)
})
