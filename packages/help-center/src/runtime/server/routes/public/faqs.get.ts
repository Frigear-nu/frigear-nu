import type { HelpFaqDto } from '../../../../types'

// Categories with the published articles the caller may read, text included: what the FAQ cards show.
//   ?categories=a,b   these categories, in this order (one the caller may not read, or that does not exist, is left out);
//                     none: every accordion category
//   ?public=1         only what anonymous visitors read: no sign-in, the answer is the same for everyone and cacheable
// Anonymous visitors, and tokens without `help-center:read`, see public categories and articles only.
export default defineEventHandler(async (event): Promise<HelpFaqDto[]> => {
  const query = await getValidatedQuery(event, helpFaqsQuery.parse)
  setResponseHeader(event, 'cache-control', query.public ? 'public, max-age=60, stale-while-revalidate=300' : 'private, no-store')
  const ctx = await helpCenterRequest(event, { public: query.public })
  return helpCenterFaqs(ctx, parseHelpSlugs(query.categories))
})
