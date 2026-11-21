import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpArticleDto } from '../../../../types'

// One article with its text, as staff see it: any status for the database, and the articles of the other sources
// (Nuxt Content, a host's own) by their id, read-only. Those ids can hold a `/` (`content:help:safety/first-aid`), which
// arrives encoded as `%2F`, so the param is decoded.
export default defineEventHandler(async (event): Promise<AdminHelpArticleDto> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse, { decode: true })
  if (!id.startsWith('hlp_')) {
    // Sources only serve articles somebody may read, and the others are public by nature: read it as a visitor.
    const article = await helpCenterArticleById(await helpCenterRequest(event, { public: true }), id)
    if (!article) throw notFound('Help article not found.')
    return toAdminContentArticleDto(article)
  }
  const row = await getHelpArticleOr404(id)
  await authorize(event, helpCenterAccess.permissions.manage, row)
  return toAdminHelpArticleDto(await getHelpCategoryOr404(row.categoryId), row)
})
