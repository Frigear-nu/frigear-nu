import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({ email: z.string(), customerId: z.string() })

// Test-only helper: links a Stripe customer id to a user, standing in for `ensureStripeCustomer`
// (which would call the Stripe API).
export default defineEventHandler(async (event) => {
  const { email, customerId } = await readValidatedBody(event, bodySchema.parse)
  const [user] = await db.update(schema.users)
    .set({ stripeCustomerId: customerId })
    .where(eq(schema.users.email, email))
    .returning()
  const resolved = await getStripeCustomerUser(customerId)
  return { id: user?.id, resolvedId: resolved?.id ?? null, column: Object.keys(schema.users).includes('stripeCustomerId') }
})
