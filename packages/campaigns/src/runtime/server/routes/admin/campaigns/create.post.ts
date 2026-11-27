import { created } from '@frigear-nu/module-kit/server'
import type { CampaignDto } from '../../../../../types'
import { campaignsAccess } from '../../../../access'
import { campaignCreateInput } from '../../../../utils/schemas'

// `POST /api/admin/campaigns` (`campaigns:manage`): creates a draft. `important` needs `campaigns:send-important` too.
// Whether it can be sent is checked when it is sent.
export default defineEventHandler(async (event): Promise<CampaignDto> => {
  const principal = await authorize(event, campaignsAccess.permissions.manage)
  const input = await readValidatedBody(event, campaignCreateInput.parse)
  if (input.important) await authorize(event, campaignsAccess.permissions['send-important'])
  if (input.kind === 'newsletter') await campaignsCheckLists(input.audience.listIds ?? [])
  const row = await createCampaign(input, principal.user ? Number(principal.user.id) : null)
  return created(event, toCampaignDto(row))
})
