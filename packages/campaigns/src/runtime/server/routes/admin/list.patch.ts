import { idParams } from '@frigear-nu/module-kit/server'
import type { CampaignListDto } from '../../../../types'
import { campaignsAccess } from '../../../access'
import { campaignListPatchInput } from '../../../utils/schemas'

// `PATCH /api/admin/campaigns/lists/:id` (`campaigns:manage`): changes a list. A changed consent text bumps its
// `consentVersion`. 409 `conflict` when the new slug is taken.
export default defineEventHandler(async (event): Promise<CampaignListDto> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, campaignListPatchInput.parse)
  const list = await getCampaignListOr404(id)
  await authorize(event, campaignsAccess.permissions.manage, list)
  const updated = await updateCampaignList(list, patch)
  const counts = await campaignListCounts([updated.id])
  return toCampaignListDto(updated, counts.get(updated.id))
})
