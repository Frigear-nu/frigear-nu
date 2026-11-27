import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { campaignsAccess } from '../../../access'

// `DELETE /api/admin/campaigns/lists/:id` (`campaigns:manage`): deletes a list and its subscriptions.
export default defineEventHandler(async (event) => {
  await authorize(event, campaignsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const list = await getCampaignListOr404(id)
  await authorize(event, campaignsAccess.permissions.manage, list)
  await deleteCampaignList(list)
  return noContent(event)
})
