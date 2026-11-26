import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// Test-only: marks a user's email address verified, as the email verification flow of auth does.
export default defineEventHandler(async (event) => {
  const { userId } = await readBody<{ userId: number }>(event)
  await db.update(schema.users).set({ emailVerifiedAt: new Date() } as never).where(eq(schema.users.id, userId))
  return { ok: true }
})
