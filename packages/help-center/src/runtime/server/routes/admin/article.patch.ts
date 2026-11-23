import { idParams } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpArticleDto } from '../../../../types'

// Edits any of the fields of an article except its status (`.../publish`, `.../unpublish`). A published article keeps
// every required language: an edit that removes one is `409 missing_translations`.
export default defineEventHandler(async (event): Promise<AdminHelpArticleDto> => {
  const principal = await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const scope = await readHelpKindScope(event)
  const patch = await readValidatedBody(event, helpArticlePatchSchema.parse)
  const existing = await getHelpArticleOr404(id)
  await assertHelpArticleKindScope(existing, scope)
  await authorize(event, helpCenterAccess.permissions.manage, existing)
  const updated = await patchHelpArticleRow(event, existing, patch, principal.user.id)
  return toAdminHelpArticleDto(await getHelpCategoryOr404(updated.categoryId), updated)
})
