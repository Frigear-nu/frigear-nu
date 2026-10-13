import { z } from 'zod'

const bodySchema = z.object({
  items: z.array(z.object({ name: z.string(), amount: z.number(), currency: z.string(), quantity: z.number().optional(), description: z.string().optional() })),
  reference: z.object({ type: z.string(), id: z.string() }).optional(),
  successUrl: z.string().default('/done'),
  cancelUrl: z.string().default('/cancel'),
  noEvent: z.boolean().optional(),
})

// Test-only: the module exposes createPayment as a server util, not as a route.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { noEvent, ...input } = body
  return createPayment({ userId: user.id, ...input }, noEvent ? undefined : event)
})
