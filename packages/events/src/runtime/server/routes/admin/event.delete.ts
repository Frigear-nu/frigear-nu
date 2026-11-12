import { db, schema } from '@nuxthub/db'
import { and, eq, sql } from 'drizzle-orm'
import { conflict, idParams, noContent, notFound } from '@frigear-nu/module-kit/server'

// Events with sold tickets cannot be deleted (archive them instead): tickets must keep their event.
export default defineEventHandler(async (event) => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const [existing] = await db.select().from(schema.events).where(eq(schema.events.id, id)).limit(1)
  if (!existing) throw notFound('Event not found.')
  await authorize(event, 'events:manage', existing)
  const [sold] = await db.select({ count: sql<number>`count(*)` }).from(schema.eventTickets)
    .where(and(eq(schema.eventTickets.eventId, id), eq(schema.eventTickets.status, 'paid')))
  if (Number(sold?.count ?? 0) > 0) throw conflict('This event has paid tickets. Archive it instead.')
  await db.delete(schema.events).where(eq(schema.events.id, id))
  return noContent(event)
})
