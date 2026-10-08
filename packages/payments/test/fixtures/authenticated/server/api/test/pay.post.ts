import { z } from 'zod'

const bodySchema = z.object({
  items: z.array(z.object({ name: z.string(), amount: z.number(), currency: z.string(), quantity: z.number().optional() })),
  reference: z.object({ type: z.string(), id: z.string() }).optional(),
  successUrl: z.string().default('/done'),
  cancelUrl: z.string().default('/cancel'),
})

// Test-only: the module exposes createPayment as a server util, not as a route.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  return createPayment({ userId: user.id, ...body }, event)
})
