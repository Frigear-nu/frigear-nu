import { z } from 'zod'
import type { OperationPublicVenueLayoutDto } from '../../../../types'

const paramsSchema = z.object({ slug: z.string().trim().min(1).max(128) })

// The venue layout of an operation and its placement on the map, for whoever may read the operation (`readableOperationBySlug`: public ones for
// everyone, others for those who take part and for staff; everybody else gets the operation's 404).
export default defineEventHandler(async (event): Promise<OperationPublicVenueLayoutDto> => {
  const { slug } = await getValidatedRouterParams(event, paramsSchema.parse)
  const row = await readableOperationBySlug(event, slug)
  return toOperationPublicVenueLayoutDto(row)
})
