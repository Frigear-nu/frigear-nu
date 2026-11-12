import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { conflict, idParams, notFound } from '@frigear-nu/module-kit/server'
import type { AttendeeDto } from '../../../../types'
import { authorizeEventsRecord } from '../../utils/admin'
import { eventsAccess } from '../../../access'

// Starts a full refund. The ticket turns `refunded` when Stripe's `charge.refunded` event arrives
// (via payments:refunded), so the state change and the money movement cannot disagree. Money moves, so it is the
// cookie-session-only `events:refund` permission (never a bearer token). Answers with the ticket as it is now (still `paid`).
export default defineEventHandler(async (event): Promise<AttendeeDto> => {
  await authorize(event, eventsAccess.permissions.refund)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const [ticket] = await db.select().from(schema.eventTickets).where(eq(schema.eventTickets.id, id)).limit(1)
  if (!ticket) throw notFound('Ticket not found.')
  // Policies of `events:refund` see the ticket's event, not the ticket.
  await authorizeEventsRecord(event, ticket.eventId, eventsAccess.permissions.refund)
  if (ticket.status !== 'paid' || !ticket.paymentId) throw conflict('Only paid tickets with a payment can be refunded.', { status: ticket.status })
  await refundPayment(ticket.paymentId)
  return toAttendeeDto(ticket, await ticketHolder(ticket.userId))
})
