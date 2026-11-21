import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'
import type { FaqGroupDto } from '../../../../types'

const paramsSchema = z.object({ slug: z.string().trim().min(1).max(128) })

// One group by its URL name, with its published items the caller may read. A group with a `public` grant needs no
// sign-in; any other goes through `faq:read` and its policy. A group that does not exist and one the caller may not
// read both answer the same 404, so the route does not tell which names exist.
export default defineEventHandler(async (event): Promise<FaqGroupDto> => {
  const { slug } = await getValidatedRouterParams(event, paramsSchema.parse)
  setResponseHeader(event, 'cache-control', 'private, no-store')
  const group = await loadFaqGroup({ event }, slug)
  if (!group) throw notFound('FAQ group not found.')
  return group
})
