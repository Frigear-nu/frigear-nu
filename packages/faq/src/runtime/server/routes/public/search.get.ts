import type { FaqSearchResult } from '../../../../types'

// Published items whose question or answer contains `?q=` in any language, among the ones the caller may read (50 at
// most). `?operation=` keeps the groups of one operation; `?public=1` searches what anonymous visitors read.
export default defineEventHandler(async (event): Promise<FaqSearchResult[]> => {
  const query = await getValidatedQuery(event, faqSearchQuery.parse)
  const operationId = query.operation || undefined

  if (query.public) {
    setResponseHeader(event, 'cache-control', 'public, max-age=60, stale-while-revalidate=300')
    return searchFaq({ event, public: true }, { query: query.q, operationId })
  }

  setResponseHeader(event, 'cache-control', 'private, no-store')
  return searchFaq({ event }, { query: query.q, operationId })
})
