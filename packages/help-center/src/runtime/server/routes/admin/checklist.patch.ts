import { idParams } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpChecklistDto } from '../../../../types'

// Edits any of the fields of a checklist. `items`, when sent, is the whole list in order and replaces the items.
export default defineEventHandler(async (event): Promise<AdminHelpChecklistDto> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, helpChecklistPatchSchema.parse)
  const existing = await getHelpChecklistOr404(id)
  await authorize(event, helpCenterAccess.permissions.manage, existing)
  return toAdminHelpChecklistDto(event, await patchHelpChecklistRow(event, existing, patch))
})
