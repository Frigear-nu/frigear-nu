import { apiError, notFound } from '@frigear-nu/module-kit/server'
import type { CampaignUnsubscribeResultDto } from '../../../../types'
import { campaignTokenKind } from '../../../utils/tokens'
import { campaignTokenParams } from '../../../utils/schemas'

// `POST /api/campaigns/unsubscribe/:token` (anonymous): the RFC 8058 one-click target of `List-Unsubscribe-Post`, so the
// body (`List-Unsubscribe=One-Click`) is not read. Never a GET: the unsubscribe page posts on a button. The token is
// signed by this module and names either a subscription (the confirmation message) or a delivery (a campaign message:
// its lists, or for a message to a user their `campaigns.message` channel). 400 `invalid_token` otherwise.
export default defineEventHandler(async (event): Promise<CampaignUnsubscribeResultDto> => {
  const { token } = await getValidatedRouterParams(event, campaignTokenParams.parse)
  const subject = await campaignsVerifyUnsubscribeToken(event, token)
  const kind = campaignTokenKind(subject)
  if (kind === 'delivery') {
    const delivery = await campaignsDeliveryFromToken(event, token)
    if (!delivery) throw notFound('This message no longer exists.')
    return campaignsUnsubscribeDelivery(event, delivery)
  }
  if (kind !== 'subscription') throw apiError(400, 'invalid_token', 'This unsubscribe link is not valid.')
  const subscription = await findCampaignSubscriptionById(subject!)
  if (!subscription) throw notFound('This subscription no longer exists.')
  const updated = await campaignsUnsubscribe(subscription)
  const list = await getCampaignListOr404(updated.listId)
  return toCampaignSubscriptionResultDto(updated, list)
})
