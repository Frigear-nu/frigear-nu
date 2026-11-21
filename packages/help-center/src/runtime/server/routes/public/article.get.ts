import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'
import type { HelpArticleDetailDto } from '../../../../types'

const paramsSchema = z.object({ slug: z.string().trim().min(1).max(128) })

// One article by its URL name, with its text and category. An article that does not exist and one the caller may not
// read both answer the same 404. `?public=1` reads it as an anonymous visitor, so the answer is cacheable.
export default defineEventHandler(async (event): Promise<HelpArticleDetailDto> => {
  const { slug } = await getValidatedRouterParams(event, paramsSchema.parse)
  const query = await getValidatedQuery(event, helpArticleQuery.parse)
  setResponseHeader(event, 'cache-control', query.public ? 'public, max-age=60, stale-while-revalidate=300' : 'private, no-store')
  const article = await helpCenterArticle(await helpCenterRequest(event, { public: query.public }), slug)
  if (!article) throw notFound('Help article not found.')
  return article
})
