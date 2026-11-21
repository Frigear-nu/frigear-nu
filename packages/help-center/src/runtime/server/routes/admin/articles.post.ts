import { created } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpArticleDto } from '../../../../types'

// Adds a draft article at the end of its category. Publish it with `POST /api/admin/help-center/articles/:id/publish`.
export default defineEventHandler(async (event): Promise<AdminHelpArticleDto> => {
  const principal = await authorize(event, helpCenterAccess.permissions.manage)
  const input = await readValidatedBody(event, helpArticleInput.parse)
  const row = await createHelpArticleRow(event, input, principal.user.id)
  const category = await getHelpCategoryOr404(row.categoryId)
  return created(event, toAdminHelpArticleDto(category, row))
})
