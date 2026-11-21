import { z } from 'zod'
import type { OperationVenueLayout } from '../../../../types'

const paramsSchema = z.object({ slug: z.string().trim().min(1).max(128) })

// The underlay image of an operation's venue layout, for whoever may read the operation. Cached publicly only for a
// public operation; the URL carries a version (`?v=`), so a new image is a new URL.
export default defineEventHandler(async (event) => {
  const { slug } = await getValidatedRouterParams(event, paramsSchema.parse)
  const row = await readableOperationBySlug(event, slug)
  const underlay = (row.venueLayout as OperationVenueLayout | null)?.underlay
  return serveMapUnderlay(event, underlay, { cache: row.public ? 'public' : 'private' })
})
