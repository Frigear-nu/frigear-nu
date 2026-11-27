import { idParams } from '@frigear-nu/module-kit/server'
import type { CampaignAddAccountsPreviewDto } from '../../../../types'
import { campaignsAccess } from '../../../access'

// `GET /api/admin/campaigns/lists/:id/accounts` (`campaigns:manage`): how many accounts "Add all current accounts" would
// add to this `auto` list now. 409 `signup_mode` for a list that does not add new accounts automatically.
export default defineEventHandler(async (event): Promise<CampaignAddAccountsPreviewDto> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const list = await getCampaignListOr404(id)
  await authorize(event, campaignsAccess.permissions.manage, list)
  campaignsAssertAutoList(list)
  return { accounts: await campaignsCountAccountsToAdd(list) }
})
