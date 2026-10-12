import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

// Test helper: backdates a token's expiry, since waiting is not an option.
export default defineEventHandler(async (event) => {
  const { id } = await readBody<{ id: string }>(event)
  await db.update(schema.authUserTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.authUserTokens.id, id))
  return { ok: true }
})
