import { z } from 'zod'
import type { OperationDto } from '../../../../types'

const paramsSchema = z.object({ slug: z.string().trim().min(1).max(128) })

// One operation by its URL name. Public ones for everyone; any other only for those who take part in it and for staff
// (the policy of `operations:read`), and everybody else gets the same 404 as for an unknown name.
export default defineEventHandler(async (event): Promise<OperationDto> => {
  const { slug } = await getValidatedRouterParams(event, paramsSchema.parse)
  return toOperationDto(await readableOperationBySlug(event, slug))
})
