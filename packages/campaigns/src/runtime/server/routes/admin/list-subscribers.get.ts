import { idParams } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import type { CampaignSubscriberDto } from '../../../../types'
import { campaignsAccess } from '../../../access'

// `GET /api/admin/campaigns/lists/:id/subscribers` (`campaigns:manage`): a page of the list's subscriptions, filtered
// by status and channel. Email addresses and phone numbers only with `campaigns:pii` (never covered by `campaigns:*`);
// without it the search matches names only.
export default defineEventHandler(async (event): Promise<Page<CampaignSubscriberDto>> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const query = await getValidatedQuery(event, campaignSubscribersQuery.parse)
  const list = await getCampaignListOr404(id)
  await authorize(event, campaignsAccess.permissions.manage, list)
  const pii = await allows(event, campaignsAccess.permissions.pii)
  return campaignListSubscribers(list, query, pii)
})
