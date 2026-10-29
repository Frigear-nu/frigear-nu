import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { conflict, idParams, notFound } from '@frigear-nu/module-kit/server'
import type { AttendeeDto } from '../../../../types'

// Starts a full refund. The ticket turns `refunded` when Stripe's `charge.refunded` event arrives
// (via payments:refunded), so the state change and the money movement cannot disagree. Money moves, so only a
// signed-in staff session may do it (never a bearer token). Answers with the ticket as it is now (still `paid`).
export default defineEventHandler(async (event): Promise<AttendeeDto> => {
  await eventsStaff.require(event, { sessionOnly: true })
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const [ticket] = await db.select().from(schema.eventTickets).where(eq(schema.eventTickets.id, id)).limit(1)
  if (!ticket) throw notFound('Ticket not found.')
  if (ticket.status !== 'paid' || !ticket.paymentId) throw conflict('Only paid tickets with a payment can be refunded.', { status: ticket.status })
  await refundPayment(ticket.paymentId)
  return toAttendeeDto(ticket, await ticketHolder(ticket.userId))
})
