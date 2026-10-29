import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { conflict, idParams, noContent, notFound } from '@frigear-nu/module-kit/server'

export default defineEventHandler(async (event) => {
  await eventsStaff.require(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const [existing] = await db.select({ id: schema.eventTicketTypes.id }).from(schema.eventTicketTypes).where(eq(schema.eventTicketTypes.id, id)).limit(1)
  if (!existing) throw notFound('Ticket type not found.')
  const [sold] = await db.select({ count: sql<number>`count(*)` }).from(schema.eventTickets)
    .where(and(eq(schema.eventTickets.ticketTypeId, id), inArray(schema.eventTickets.status, ['paid', 'pending'])))
  if (Number(sold?.count ?? 0) > 0) throw conflict('This ticket type has tickets. Cancel them first.')
  await db.delete(schema.eventTicketTypes).where(eq(schema.eventTicketTypes.id, id))
  return noContent(event)
})
