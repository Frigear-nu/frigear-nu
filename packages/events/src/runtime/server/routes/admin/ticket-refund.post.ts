import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// Starts a full refund. The ticket turns `refunded` when Stripe's `charge.refunded` event arrives
// (via payments:refunded), so the state change and the money movement cannot disagree.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const [ticket] = await db.select().from(schema.eventTickets).where(eq(schema.eventTickets.id, getRouterParam(event, 'id')!)).limit(1)
  if (!ticket) throw createError({ statusCode: 404, statusMessage: 'Ticket not found.' })
  if (ticket.status !== 'paid' || !ticket.paymentId) throw createError({ statusCode: 409, statusMessage: 'Only paid tickets with a payment can be refunded.' })
  await refundPayment(ticket.paymentId)
  return { ok: true }
})
