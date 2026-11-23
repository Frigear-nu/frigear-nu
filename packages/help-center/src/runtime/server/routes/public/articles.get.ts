import type { HelpArticleSummaryDto } from '../../../../types'

// The published articles the caller may read, without their text, in the order of the categories.
//   ?q=          articles whose title or text contains it, in any language (50 at most)
//   ?category=   only the articles of the category with this URL name
//   ?kind=       only the articles of `help` or of `faq` categories
//   ?public=1    only what anonymous visitors read: no sign-in, the answer is the same for everyone and cacheable
// Anonymous visitors, and tokens without `help-center:read`, see public articles only.
export default defineEventHandler(async (event): Promise<HelpArticleSummaryDto[]> => {
  const query = await getValidatedQuery(event, helpArticlesQuery.parse)
  setResponseHeader(event, 'cache-control', query.public ? 'public, max-age=60, stale-while-revalidate=300' : 'private, no-store')
  const ctx = await helpCenterRequest(event, { public: query.public })
  return helpCenterArticles(ctx, { q: query.q, category: query.category || undefined, kind: query.kind })
})
