import { apiError, notFound } from '@frigear-nu/module-kit/server'
import type { CampaignSubscriptionResultDto } from '../../../../types'
import { CAMPAIGN_SUBSCRIPTION_PREFIX } from '../../../utils/tokens'
import { campaignTokenParams } from '../../../utils/schemas'

// `POST /api/campaigns/unsubscribe/:token` (anonymous): unsubscribes the subscription the token was signed for. The
// RFC 8058 one-click target of `List-Unsubscribe-Post`, so the body (`List-Unsubscribe=One-Click`) is not read. Never a
// GET: the unsubscribe page posts on a button. 400 `invalid_token` for a token we did not sign.
export default defineEventHandler(async (event): Promise<CampaignSubscriptionResultDto> => {
  const { token } = await getValidatedRouterParams(event, campaignTokenParams.parse)
  const subject = await campaignsVerifyUnsubscribeToken(event, token)
  if (!subject || !subject.startsWith(`${CAMPAIGN_SUBSCRIPTION_PREFIX}_`)) throw apiError(400, 'invalid_token', 'This unsubscribe link is not valid.')
  const subscription = await findCampaignSubscriptionById(subject)
  if (!subscription) throw notFound('This subscription no longer exists.')
  const updated = await campaignsUnsubscribe(subscription)
  const list = await getCampaignListOr404(updated.listId)
  return toCampaignSubscriptionResultDto(updated, list)
})
