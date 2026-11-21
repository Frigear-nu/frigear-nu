import { conflict, idParams } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpArticleDto } from '../../../../types'

// Turns a published article back into a draft: it disappears for everyone but staff.
export default defineEventHandler(async (event): Promise<AdminHelpArticleDto> => {
  const principal = await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getHelpArticleOr404(id)
  await authorize(event, helpCenterAccess.permissions.manage, existing)
  const category = await getHelpCategoryOr404(existing.categoryId)
  if (existing.status === 'draft') return toAdminHelpArticleDto(category, existing)

  const row = await setHelpArticleStatus(existing, 'draft', principal.user.id)
  if (!row) throw conflict('The article was changed by someone else. Reload it and try again.')
  return toAdminHelpArticleDto(category, row)
})
