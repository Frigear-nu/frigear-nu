import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({ email: z.string(), choices: z.record(z.string(), z.record(z.string(), z.boolean())) })

// Test-only: stores notification choices straight on `users.preferences` (as the choices store keeps them) and answers
// them as read back.
export default defineEventHandler(async (event) => {
  const { email, choices } = await readValidatedBody(event, bodySchema.parse)
  const [row] = await db.select({ preferences: schema.users.preferences }).from(schema.users).where(eq(schema.users.email, email))
  const [updated] = await db.update(schema.users)
    .set({ preferences: { ...row?.preferences, notificationChannels: choices } })
    .where(eq(schema.users.email, email))
    .returning({ preferences: schema.users.preferences })
  return getUserPreference(updated, 'notificationChannels') ?? {}
})
