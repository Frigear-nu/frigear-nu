import { z } from 'zod'
import type { PurchaseBody, PurchaseResponse } from '../../../../types'

const bodySchema = z.object({
  ticketTypeId: z.string().min(1),
  addonIds: z.array(z.string().min(1)).max(50).optional(),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
  locale: z.string().regex(/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i).max(16).optional(),
}) satisfies z.ZodType<PurchaseBody>

export default defineEventHandler(async (event): Promise<PurchaseResponse> => {
  const user = await requireUser(event, { scopes: ['tickets:write'] })
  const body = await readValidatedBody(event, bodySchema.parse)
  return purchaseTicket(event, user.id, getRouterParam(event, 'slug')!, body)
})
