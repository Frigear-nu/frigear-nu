import { idParams } from '@frigear-nu/module-kit/server'
import type { CampaignDto } from '../../../../../types'
import { campaignsAccess } from '../../../../access'
import { campaignPatchInput } from '../../../../utils/schemas'

// `PATCH /api/admin/campaigns/:id` (`campaigns:manage`): changes a draft; 409 `not_draft` once it was sent or scheduled.
// Making it important, or changing an important one, needs `campaigns:send-important`.
export default defineEventHandler(async (event): Promise<CampaignDto> => {
  await authorize(event, campaignsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, campaignPatchInput.parse)
  const row = await getCampaignOr404(id)
  await authorize(event, campaignsAccess.permissions.manage, row)
  campaignsRequireDraft(row)
  if (patch.important || row.important) await authorize(event, campaignsAccess.permissions['send-important'], row)
  if (row.kind === 'newsletter' && patch.audience) await campaignsCheckLists(patch.audience.listIds ?? [])
  return toCampaignDto(await updateCampaign(row, patch))
})
