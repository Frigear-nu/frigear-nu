import { idParams } from '@frigear-nu/module-kit/server'
import type { CampaignAddAccountsResultDto } from '../../../../types'
import { campaignsAccess } from '../../../access'

// `POST /api/admin/campaigns/lists/:id/accounts` (`campaigns:manage`): "Add all current accounts" of an `auto` list.
// Every account not on the list yet is added as an active subscriber on email; nobody who unsubscribed comes back, and
// with double opt-in only accounts with a verified address are added. 409 `signup_mode` for a list that does not add new
// accounts automatically.
export default defineEventHandler(async (event): Promise<CampaignAddAccountsResultDto> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const list = await getCampaignListOr404(id)
  await authorize(event, campaignsAccess.permissions.manage, list)
  campaignsAssertAutoList(list)
  return { added: await campaignsAddAllAccounts(list) }
})
