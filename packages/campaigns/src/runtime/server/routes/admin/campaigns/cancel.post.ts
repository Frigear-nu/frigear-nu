import { idParams } from '@frigear-nu/module-kit/server'
import type { CampaignDto } from '../../../../../types'
import { campaignsAccess } from '../../../../access'

// `POST /api/admin/campaigns/:id/cancel` (`campaigns:send`): stops a scheduled campaign or one being sent; what is not
// sent yet is skipped. 409 `not_cancellable` otherwise.
export default defineEventHandler(async (event): Promise<CampaignDto> => {
  await authorize(event, campaignsAccess.permissions.send)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getCampaignOr404(id)
  await authorize(event, campaignsAccess.permissions.send, row)
  return toCampaignDto(await campaignsCancel(row))
})
