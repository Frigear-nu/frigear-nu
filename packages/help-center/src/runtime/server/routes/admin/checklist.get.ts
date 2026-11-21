import { idParams } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpChecklistDto } from '../../../../types'

// One checklist with its items.
export default defineEventHandler(async (event): Promise<AdminHelpChecklistDto> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getHelpChecklistOr404(id)
  await authorize(event, helpCenterAccess.permissions.manage, row)
  return toAdminHelpChecklistDto(event, row)
})
