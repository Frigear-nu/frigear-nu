import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event): Promise<{ url: string }> => {
  const { user } = await requireUserSession(event)
  const [ticket] = await db.select().from(schema.eventTickets)
    .where(and(eq(schema.eventTickets.id, getRouterParam(event, 'id')!), eq(schema.eventTickets.userId, user.id)))
    .limit(1)
  if (!ticket) throw createError({ statusCode: 404, statusMessage: 'Ticket not found.' })
  if (ticket.status === 'paid') throw createError({ statusCode: 409, statusMessage: 'This ticket is already paid.' })
  if (ticket.status !== 'pending' || !ticket.paymentId) throw createError({ statusCode: 409, statusMessage: 'This ticket can no longer be paid. Buy a new one.' })
  return resumePayment(ticket.paymentId, user.id, event)
})
