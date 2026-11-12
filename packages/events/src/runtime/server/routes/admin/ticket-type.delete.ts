import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { conflict, idParams, noContent } from '@frigear-nu/module-kit/server'
import { authorizeEventsRecord, eventsIdOfTicketType } from '../../utils/admin'

export default defineEventHandler(async (event) => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  await authorizeEventsRecord(event, await eventsIdOfTicketType(id))
  const [sold] = await db.select({ count: sql<number>`count(*)` }).from(schema.eventTickets)
    .where(and(eq(schema.eventTickets.ticketTypeId, id), inArray(schema.eventTickets.status, ['paid', 'pending'])))
  if (Number(sold?.count ?? 0) > 0) throw conflict('This ticket type has tickets. Cancel them first.')
  await db.delete(schema.eventTicketTypes).where(eq(schema.eventTicketTypes.id, id))
  return noContent(event)
})
