import { idParams } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'
import type { AdminFaqItemDto } from '../../../../types'

// Edits any of the fields of an item except its status (`.../publish`, `.../unpublish`). A published item keeps every
// required language: an edit that removes one is `409 missing_translations`.
export default defineEventHandler(async (event): Promise<AdminFaqItemDto> => {
  const principal = await authorize(event, faqAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, faqItemPatchSchema.parse)
  const existing = await getFaqItemOr404(id)
  await authorize(event, faqAccess.permissions.manage, existing)
  const updated = await patchFaqItemRow(event, existing, patch, principal.user.id)
  if (updated !== existing) await callFaqGroupUpdated(event, existing.groupId)
  return toAdminFaqItemDto(updated)
})
