import type { CampaignListPublicDto } from '../../../../types'
import { campaignSlugParams } from '../../../utils/schemas'

// `GET /api/campaigns/lists/:slug` (anonymous): a public list as the signup shows it. A list that is not public is 404.
export default defineEventHandler(async (event): Promise<CampaignListPublicDto> => {
  const { slug } = await getValidatedRouterParams(event, campaignSlugParams.parse)
  return toCampaignListPublicDto(await getPublicCampaignListOr404(slug))
})
