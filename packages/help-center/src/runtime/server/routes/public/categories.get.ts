import type { HelpCategoryDto } from '../../../../types'

// The categories the caller may read, in their order.
//   ?kind=      only `help` or only `faq` categories
//   ?public=1   only what anonymous visitors read: no sign-in, the answer is the same for everyone and cacheable
// Anonymous visitors, and tokens without `help-center:read`, see public categories only.
export default defineEventHandler(async (event): Promise<HelpCategoryDto[]> => {
  const query = await getValidatedQuery(event, helpCategoriesQuery.parse)
  // Nothing in a public answer depends on who asks, so a CDN or the browser may keep it for a minute.
  setResponseHeader(event, 'cache-control', query.public ? 'public, max-age=60, stale-while-revalidate=300' : 'private, no-store')
  const categories = await helpCenterCategories(await helpCenterRequest(event, { public: query.public }))
  return query.kind ? categories.filter(category => category.kind === query.kind) : categories
})
