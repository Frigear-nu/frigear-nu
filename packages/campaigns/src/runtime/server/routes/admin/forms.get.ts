import type { CampaignFormOptionDto } from '../../../../types'
import { campaignsAccess } from '../../../access'

// `GET /api/admin/campaigns/forms` (`campaigns:manage`, only with `@frigear-nu/forms`): the forms a list can sign people
// up from (not archived), with the fields that can hold an address, a name or the consent.
export default defineEventHandler(async (event): Promise<CampaignFormOptionDto[]> => {
  await authorize(event, campaignsAccess.permissions.manage)
  return campaignsFormOptions()
})
