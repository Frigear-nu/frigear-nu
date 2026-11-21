import { helpCenterAccess } from '../../../access'
import type { AdminHelpChecklistDto } from '../../../../types'

// Every checklist with its items, whatever its grants, in their order. A small, bounded list, so an array.
export default defineEventHandler(async (event): Promise<AdminHelpChecklistDto[]> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  return toAdminHelpChecklistDtos(event, await listHelpChecklistRows())
})
