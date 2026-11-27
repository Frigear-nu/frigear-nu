import { idParams } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import type { CampaignDeliveryDto } from '../../../../../types'
import { campaignsAccess } from '../../../../access'

// `GET /api/admin/campaigns/:id/deliveries` (`campaigns:manage` and `campaigns:pii`, which `campaigns:*` never covers):
// a page of the per-recipient rows with who they went to.
export default defineEventHandler(async (event): Promise<Page<CampaignDeliveryDto>> => {
  await authorize(event, campaignsAccess.permissions.manage)
  await authorize(event, campaignsAccess.permissions.pii)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const query = await getValidatedQuery(event, campaignDeliveriesQuery.parse)
  const row = await getCampaignOr404(id)
  await authorize(event, campaignsAccess.permissions.pii, row)
  return listCampaignDeliveries(row, query)
})
