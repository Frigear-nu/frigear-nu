import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import { contentArticleDto } from '../../content-source'
import { isContentArticleId } from '../../../utils/content'
import type { AdminHelpArticleDto } from '../../../../types'

// One article with its text, as staff see it: any status, and the files of Nuxt Content (read-only) by their id.
export default defineEventHandler(async (event): Promise<AdminHelpArticleDto> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  if (isContentArticleId(id)) {
    const article = (await helpCenterContentArticles(event)).find(entry => entry.id === id)
    if (!article) throw notFound('Help article not found.')
    return toAdminContentArticleDto(contentArticleDto(article))
  }
  const row = await getHelpArticleOr404(id)
  await authorize(event, helpCenterAccess.permissions.manage, row)
  return toAdminHelpArticleDto(await getHelpCategoryOr404(row.categoryId), row)
})
