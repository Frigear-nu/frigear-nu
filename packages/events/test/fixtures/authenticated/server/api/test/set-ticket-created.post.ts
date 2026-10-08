import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// Test-only: backdates a ticket so its reservation window has passed.
export default defineEventHandler(async (event) => {
  const { id, minutesAgo } = await readBody<{ id: string, minutesAgo: number }>(event)
  await db.update(schema.eventTickets).set({ createdAt: new Date(Date.now() - minutesAgo * 60_000) }).where(eq(schema.eventTickets.id, id))
  return { ok: true }
})
