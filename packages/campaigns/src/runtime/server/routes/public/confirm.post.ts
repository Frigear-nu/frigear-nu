import type { CampaignSubscriptionResultDto } from '../../../../types'
import { campaignTokenParams } from '../../../utils/schemas'

// `POST /api/campaigns/confirm/:token` (anonymous): confirms the subscription of the token in the confirmation message.
// Never a GET: a link scanner opening the link must not confirm anything (the confirm page posts on a button).
// 400 `invalid_token` for an unknown or used token, 410 `token_expired` for an expired one.
export default defineEventHandler(async (event): Promise<CampaignSubscriptionResultDto> => {
  const { token } = await getValidatedRouterParams(event, campaignTokenParams.parse)
  const subscription = await campaignsConfirm(token)
  const list = await getCampaignListOr404(subscription.listId)
  return toCampaignSubscriptionResultDto(subscription, list)
})
