import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { email } = await readBody<{ email: string }>(event)
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, email))
  return { ok: true }
})
