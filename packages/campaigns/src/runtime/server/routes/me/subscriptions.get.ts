import type { CampaignMySubscriptionsDto } from '../../../../types'
import { campaignsAccess } from '../../../access'

// `GET /api/campaigns/me/subscriptions` (`campaigns:subscriptions`: a session, or a token given it): the public lists
// and the others the caller is on, with their subscription per channel. Links their contact by verified email.
export default defineEventHandler(async (event): Promise<CampaignMySubscriptionsDto> => {
  const { user } = await authorize(event, campaignsAccess.permissions.subscriptions)
  return campaignsMySubscriptions(await campaignsLoadMe(Number(user.id)))
})
