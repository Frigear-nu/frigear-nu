import { createViewer } from '@frigear-nu/audience'
import { faqAccess } from '../../../access'
import type { FaqGroupDto } from '../../../../types'

// The groups the caller may read, each with its published items they may read, in `sort` order.
//   ?slugs=a,b   only these groups, in this order (a group that does not exist or that you may not read is left out)
//   ?operation=  only the groups owned by this operation
//   ?public=1    only what anonymous visitors read: no sign-in, the answer is the same for everyone and cacheable
// Anonymous visitors, and tokens without `faq:read`, see public groups only.
export default defineEventHandler(async (event): Promise<FaqGroupDto[]> => {
  const query = await getValidatedQuery(event, faqListQuery.parse)
  const options = { slugs: parseFaqSlugs(query.slugs), operationId: query.operation || undefined }

  if (query.public) {
    // Nothing here depends on who asks, so a CDN or the browser may keep it for a minute.
    setResponseHeader(event, 'cache-control', 'public, max-age=60, stale-while-revalidate=300')
    return loadFaqGroups({ ...options, viewer: createViewer() })
  }

  setResponseHeader(event, 'cache-control', 'private, no-store')
  const principal = await allows(event, faqAccess.permissions.read) ? await getAuth(event) : null
  const viewer = await resolveFaqViewer(event, principal?.user ?? null)
  return loadFaqGroups({ ...options, viewer })
})
