import { z } from 'zod'
import type { PurchaseBody, PurchaseResponse } from '../../../../types'

const bodySchema = z.object({
  ticketTypeId: z.string().min(1),
  addonIds: z.array(z.string().min(1)).max(50).optional(),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
}) satisfies z.ZodType<PurchaseBody>

export default defineEventHandler(async (event): Promise<PurchaseResponse> => {
  const { user } = await requireUserSession(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  return purchaseTicket(event, user.id, getRouterParam(event, 'slug')!, body)
})
