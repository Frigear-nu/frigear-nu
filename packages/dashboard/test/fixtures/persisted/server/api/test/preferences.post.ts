import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({ email: z.string(), preferences: z.record(z.string(), z.unknown()).optional() })

// Test-only: answers the stored `users.preferences` of a user, after replacing them when `preferences` is sent (to
// store a layout the routes would refuse, as an older version or a hand edit might have).
export default defineEventHandler(async (event) => {
  const { email, preferences } = await readValidatedBody(event, bodySchema.parse)
  if (preferences) await db.update(schema.users).set({ preferences }).where(eq(schema.users.email, email))
  const [row] = await db.select({ preferences: schema.users.preferences }).from(schema.users).where(eq(schema.users.email, email)).limit(1)
  return { preferences: row?.preferences ?? null }
})
