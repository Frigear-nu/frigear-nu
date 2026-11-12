import { z } from 'zod'
import type { PurchaseBody, PurchaseResponse } from '../../../../types'

const paramsSchema = z.object({ slug: z.string().trim().min(1).max(128) })

const bodySchema = z.object({
  ticketTypeId: z.string().min(1),
  addonIds: z.array(z.string().min(1)).max(50).optional(),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
  locale: z.string().regex(/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i).max(16).optional(),
}) satisfies z.ZodType<PurchaseBody>

export default defineEventHandler(async (event): Promise<PurchaseResponse> => {
  const { user } = await authorize(event, 'tickets:write')
  const { slug } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  return purchaseTicket(event, user.id, slug, body)
})
