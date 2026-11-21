import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'
import type { FaqGroupDto } from '../../../../types'

const paramsSchema = z.object({ slug: z.string().trim().min(1).max(128) })

// One group by its URL name, with its published items the caller may read. A group that does not exist and one the
// caller may not read both answer the same 404.
export default defineEventHandler(async (event): Promise<FaqGroupDto> => {
  const { slug } = await getValidatedRouterParams(event, paramsSchema.parse)
  setResponseHeader(event, 'cache-control', 'private, no-store')
  const principal = await allows(event, faqAccess.permissions.read) ? await getAuth(event) : null
  const viewer = await resolveFaqViewer(event, principal?.user ?? null)
  const group = await loadFaqGroup(slug, viewer)
  if (!group) throw notFound('FAQ group not found.')
  return group
})
