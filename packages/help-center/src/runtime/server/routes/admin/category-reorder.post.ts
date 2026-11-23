import { idParams } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpArticleDto } from '../../../../types'

// Puts the category's articles in the order of `articleIds`, which must be exactly the category's article ids (drafts
// included). Anything else is `400 invalid_order`. Answers with the articles in their new order.
export default defineEventHandler(async (event): Promise<AdminHelpArticleDto[]> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const scope = await readHelpKindScope(event)
  const { articleIds } = await readValidatedBody(event, helpReorderInput.parse)
  const category = await getHelpCategoryOr404(id)
  assertHelpKindScope(helpCategoryKind(category.kind), scope, 'category')
  await authorize(event, helpCenterAccess.permissions.manage, category)
  return (await reorderHelpArticles(category.id, articleIds)).map(row => toAdminHelpArticleDto(category, row))
})
