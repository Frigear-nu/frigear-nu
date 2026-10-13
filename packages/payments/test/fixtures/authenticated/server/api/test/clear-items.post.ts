import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// Test-only: simulates a row created before the `items` column existed.
export default defineEventHandler(async (event) => {
  const { id } = await readBody<{ id: string }>(event)
  await db.update(schema.payments).set({ items: null }).where(eq(schema.payments.id, id))
  return { ok: true }
})
