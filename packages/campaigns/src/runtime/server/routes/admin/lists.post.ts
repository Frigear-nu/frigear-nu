import { created } from '@frigear-nu/module-kit/server'
import type { CampaignListDto } from '../../../../types'
import { campaignsAccess } from '../../../access'
import { campaignListCreateInput } from '../../../utils/schemas'

// `POST /api/admin/campaigns/lists` (`campaigns:manage`): creates a list. 409 `conflict` when the slug is taken.
export default defineEventHandler(async (event): Promise<CampaignListDto> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const input = await readValidatedBody(event, campaignListCreateInput.parse)
  return created(event, toCampaignListDto(await createCampaignList(input)))
})
