import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

// Test-only: gives a user a phone number (the fixture extends `users` with a `phone` column, as a host with SMS would).
export default defineEventHandler(async (event) => {
  const { userId, phone } = await readValidatedBody(event, z.object({ userId: z.string(), phone: z.string() }).parse)
  await db.update(schema.users).set({ phone } as never).where(eq(schema.users.id, Number(userId)))
  return { ok: true }
})
