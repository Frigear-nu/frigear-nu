import { notFound } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'

// Marks an article as read by the caller. It must be one the caller may read: anything else answers the same 404 as an
// article that does not exist. Reading twice keeps the first time.
export default defineEventHandler(async (event): Promise<{ articleId: string, readAt: string }> => {
  const principal = await authorize(event, helpCenterAccess.permissions.read)
  const { articleId } = await readValidatedBody(event, helpReadInput.parse)
  const article = await helpCenterArticleById(await helpCenterRequest(event), articleId)
  if (!article) throw notFound('Help article not found.')
  return markHelpArticleRead(principal.user.id, article.id)
})
