import { db, schema } from '@nuxthub/db'
import { asc, eq } from 'drizzle-orm'

// One event with all of its ticket types (including capacity and sale window), whatever its status.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const id = getRouterParam(event, 'id')!
  const [row] = await db.select().from(schema.events).where(eq(schema.events.id, id)).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Event not found.' })
  const ticketTypes = await db.select().from(schema.eventTicketTypes)
    .where(eq(schema.eventTicketTypes.eventId, id))
    .orderBy(asc(schema.eventTicketTypes.sortOrder))
  return { ...row, ticketTypes }
})
