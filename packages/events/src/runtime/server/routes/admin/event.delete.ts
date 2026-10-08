import { db, schema } from '@nuxthub/db'
import { and, eq, sql } from 'drizzle-orm'

// Events with sold tickets cannot be deleted (archive them instead): tickets must keep their event.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const id = getRouterParam(event, 'id')!
  const [sold] = await db.select({ count: sql<number>`count(*)` }).from(schema.eventTickets)
    .where(and(eq(schema.eventTickets.eventId, id), eq(schema.eventTickets.status, 'paid')))
  if (Number(sold?.count ?? 0) > 0) throw createError({ statusCode: 409, statusMessage: 'This event has paid tickets. Archive it instead.' })
  await db.delete(schema.events).where(eq(schema.events.id, id))
  return { ok: true }
})
