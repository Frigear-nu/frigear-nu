import { idParams } from '@frigear-nu/module-kit/server'
import type { CampaignDto } from '../../../../../types'
import { campaignsAccess } from '../../../../access'

// `POST /api/admin/campaigns/:id/send` (`campaigns:send`; an important message `campaigns:send-important` too): sends
// a draft now. The deliver task sends it in batches; one batch starts right after the answer. 400 `validation_failed`
// when it is not ready, 400 `audience_not_resolved` when it would reach nobody, 409 `not_draft`.
export default defineEventHandler(async (event): Promise<CampaignDto> => {
  const principal = await authorize(event, campaignsAccess.permissions.send)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getCampaignOr404(id)
  await authorize(event, campaignsAccess.permissions.send, row)
  if (row.important) await authorize(event, campaignsAccess.permissions['send-important'], row)
  campaignsRequireDraft(row)
  const updated = await campaignsScheduleSend(event, row, principal.user ? Number(principal.user.id) : null)
  campaignsDeliverSoon(event)
  return toCampaignDto(updated)
})
