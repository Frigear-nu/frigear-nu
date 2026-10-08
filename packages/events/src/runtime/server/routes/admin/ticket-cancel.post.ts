import { db, schema } from '@nuxthub/db'
import { and, eq, inArray } from 'drizzle-orm'

// Cancels an unpaid/free-of-charge ticket and frees its seat. Paid tickets go through /refund.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const id = getRouterParam(event, 'id')!
  const [ticket] = await db.select().from(schema.eventTickets).where(eq(schema.eventTickets.id, id)).limit(1)
  if (!ticket) throw createError({ statusCode: 404, statusMessage: 'Ticket not found.' })
  if (ticket.status === 'paid' && ticket.amount > 0) {
    throw createError({ statusCode: 409, statusMessage: 'This ticket was paid for. Refund it instead.' })
  }
  const [updated] = await db.update(schema.eventTickets).set({ status: 'cancelled' })
    .where(and(eq(schema.eventTickets.id, id), inArray(schema.eventTickets.status, ['pending', 'paid'])))
    .returning()
  if (!updated) throw createError({ statusCode: 409, statusMessage: `Ticket is already ${ticket.status}.` })
  return { ok: true }
})
