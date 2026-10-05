import { z } from 'zod/v4'

export const eventPurchaseTicketsSchema = z.object({
  eventPath: z.string(),
  ticketKey: z.string(),
  productIds: z.array(z.string()),
  locale: z.string().optional(),
})
