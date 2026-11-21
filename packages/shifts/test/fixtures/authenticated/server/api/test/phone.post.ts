import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// Test-only: gives a user a phone number (crew's `users.phone`).
export default defineEventHandler(async (event) => {
  const { userId, phone } = await readBody<{ userId: number, phone: string | null }>(event)
  await db.update(schema.users).set({ phone }).where(eq(schema.users.id, userId))
  return { ok: true }
})
