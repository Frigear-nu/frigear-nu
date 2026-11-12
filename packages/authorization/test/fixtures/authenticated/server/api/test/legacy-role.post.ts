import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

// Test only: writes the legacy `users.role` column, which only the role migration reads.
export default defineEventHandler(async (event) => {
  const { email, role } = await readBody<{ email: string, role: string }>(event)
  await db.update(schema.users).set({ role }).where(eq(schema.users.email, email))
  return { ok: true }
})
