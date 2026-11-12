import { db, schema } from '@nuxthub/db'
import { and, eq, inArray } from 'drizzle-orm'
import { conflict, idParams, notFound } from '@frigear-nu/module-kit/server'
import type { AttendeeDto } from '../../../../types'
import { authorizeEventsRecord } from '../../utils/admin'

// Cancels an unpaid/free-of-charge ticket and frees its seat. Paid tickets go through /refund.
export default defineEventHandler(async (event): Promise<AttendeeDto> => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const [ticket] = await db.select().from(schema.eventTickets).where(eq(schema.eventTickets.id, id)).limit(1)
  if (!ticket) throw notFound('Ticket not found.')
  // Policies of `events:manage` see the ticket's event, not the ticket.
  await authorizeEventsRecord(event, ticket.eventId)
  if (ticket.status === 'paid' && ticket.amount > 0) throw conflict('This ticket was paid for. Refund it instead.')
  const [updated] = await db.update(schema.eventTickets).set({ status: 'cancelled' })
    .where(and(eq(schema.eventTickets.id, id), inArray(schema.eventTickets.status, ['pending', 'paid'])))
    .returning()
  if (!updated) throw conflict(`Ticket is already ${ticket.status}.`, { status: ticket.status })
  return toAttendeeDto(updated, await ticketHolder(updated.userId))
})
