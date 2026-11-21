import { createViewer } from '@frigear-nu/audience'
import { faqAccess } from '../../../access'
import type { FaqSearchResult } from '../../../../types'

// Published items whose question or answer contains `?q=` in any language, among the ones the caller may read (50 at
// most). `?operation=` keeps the groups of one operation; `?public=1` searches what anonymous visitors read.
export default defineEventHandler(async (event): Promise<FaqSearchResult[]> => {
  const query = await getValidatedQuery(event, faqSearchQuery.parse)
  const operationId = query.operation || undefined

  if (query.public) {
    setResponseHeader(event, 'cache-control', 'public, max-age=60, stale-while-revalidate=300')
    return searchFaq({ viewer: createViewer(), query: query.q, operationId })
  }

  setResponseHeader(event, 'cache-control', 'private, no-store')
  const principal = await allows(event, faqAccess.permissions.read) ? await getAuth(event) : null
  const viewer = await resolveFaqViewer(event, principal?.user ?? null)
  return searchFaq({ viewer, query: query.q, operationId })
})
