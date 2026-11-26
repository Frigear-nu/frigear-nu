import { idParams } from '@frigear-nu/module-kit/server'
import type { CampaignDto } from '../../../../../types'
import { campaignsAccess } from '../../../../access'
import { campaignScheduleInput } from '../../../../utils/schemas'

// `POST /api/admin/campaigns/:id/schedule` (`campaigns:send`; an important message `campaigns:send-important` too):
// `{ scheduledAt }` in the future. The audience of a message is resolved now; a newsletter's lists are read when it
// goes out. Cancel it to stop it.
export default defineEventHandler(async (event): Promise<CampaignDto> => {
  const principal = await authorize(event, campaignsAccess.permissions.send)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const { scheduledAt } = await readValidatedBody(event, campaignScheduleInput.parse)
  const row = await getCampaignOr404(id)
  await authorize(event, campaignsAccess.permissions.send, row)
  if (row.important) await authorize(event, campaignsAccess.permissions['send-important'], row)
  campaignsRequireDraft(row)
  return toCampaignDto(await campaignsScheduleSend(event, row, principal.user ? Number(principal.user.id) : null, scheduledAt))
})
