import type { CampaignMySubscriptionsDto } from '../../../../types'
import { campaignsAccess } from '../../../access'
import { campaignMySubscriptionsPatch } from '../../../utils/schemas'

// `PATCH /api/campaigns/me/subscriptions` (`campaigns:subscriptions`): `{ lists: { [listId]: { email?, sms? } } }` turns
// channels on (email only) or off. Only ever the caller's own. Answers like the GET.
export default defineEventHandler(async (event): Promise<CampaignMySubscriptionsDto> => {
  const { user } = await authorize(event, campaignsAccess.permissions.subscriptions)
  const { lists } = await readValidatedBody(event, campaignMySubscriptionsPatch.parse)
  return campaignsUpdateMySubscriptions(event, await campaignsLoadMe(Number(user.id)), lists)
})
