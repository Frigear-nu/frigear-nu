import { conflict, idParams } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpArticleDto } from '../../../../types'

// Publishes an article once it has text in every required language (`requiredLocales`, `da` and `en` by default) in both
// the title and the body; otherwise `409 missing_translations`, with the missing languages in `data.missing`.
// Publishing a published article changes nothing.
export default defineEventHandler(async (event): Promise<AdminHelpArticleDto> => {
  const principal = await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getHelpArticleOr404(id)
  await authorize(event, helpCenterAccess.permissions.manage, existing)
  const category = await getHelpCategoryOr404(existing.categoryId)
  if (existing.status === 'published') return toAdminHelpArticleDto(category, existing)

  assertHelpArticlePublishable(existing)
  const row = await setHelpArticleStatus(existing, 'published', principal.user.id)
  if (!row) throw conflict('The article was changed by someone else. Reload it and try again.')
  return toAdminHelpArticleDto(category, row)
})
