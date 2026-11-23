import { idParams } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpArticleDto } from '../../../../types'

// Every article of a category, drafts included, in the order readers see them: what the order editor shows.
export default defineEventHandler(async (event): Promise<AdminHelpArticleDto[]> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const scope = await readHelpKindScope(event)
  const category = await getHelpCategoryOr404(id)
  assertHelpKindScope(helpCategoryKind(category.kind), scope, 'category')
  await authorize(event, helpCenterAccess.permissions.manage, category)
  return (await listHelpCategoryArticleRows(category.id)).map(row => toAdminHelpArticleDto(category, row))
})
