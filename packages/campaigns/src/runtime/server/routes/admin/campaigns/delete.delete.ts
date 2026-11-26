import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { campaignsAccess } from '../../../../access'

// `DELETE /api/admin/campaigns/:id` (`campaigns:manage`): deletes a draft; 409 `not_draft` for a campaign that went out
// or is scheduled (cancel it instead: its counts and links stay).
export default defineEventHandler(async (event) => {
  await authorize(event, campaignsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getCampaignOr404(id)
  await authorize(event, campaignsAccess.permissions.manage, row)
  campaignsRequireDraft(row)
  await deleteCampaign(row)
  return noContent(event)
})
