import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const id = getRouterParam(event, 'id')!
  const [sold] = await db.select({ count: sql<number>`count(*)` }).from(schema.eventTickets)
    .where(and(eq(schema.eventTickets.ticketTypeId, id), inArray(schema.eventTickets.status, ['paid', 'pending'])))
  if (Number(sold?.count ?? 0) > 0) throw createError({ statusCode: 409, statusMessage: 'This ticket type has tickets. Cancel them first.' })
  await db.delete(schema.eventTicketTypes).where(eq(schema.eventTicketTypes.id, id))
  return { ok: true }
})
