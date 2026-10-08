import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({ email: z.string(), customerId: z.string() })

// Test-only: links a Stripe customer id to a user so signed webhooks resolve to them.
export default defineEventHandler(async (event) => {
  const { email, customerId } = await readValidatedBody(event, bodySchema.parse)
  const [user] = await db.update(schema.users).set({ stripeCustomerId: customerId }).where(eq(schema.users.email, email)).returning()
  return { id: user?.id }
})
