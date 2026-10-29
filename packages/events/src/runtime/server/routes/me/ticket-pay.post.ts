import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { conflict, idParams, notFound } from '@frigear-nu/module-kit/server'

// Resumes paying for one of the caller's pending tickets: a fresh checkout URL for its payment.
export default defineEventHandler(async (event): Promise<{ url: string }> => {
  const user = await requireUser(event, { scopes: ['tickets:write'] })
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const [ticket] = await db.select().from(schema.eventTickets)
    .where(and(eq(schema.eventTickets.id, id), eq(schema.eventTickets.userId, user.id)))
    .limit(1)
  if (!ticket) throw notFound('Ticket not found.')
  if (ticket.status === 'paid') throw conflict('This ticket is already paid.', { status: ticket.status })
  if (ticket.status !== 'pending' || !ticket.paymentId) throw conflict('This ticket can no longer be paid. Buy a new one.', { status: ticket.status })
  const { url } = await resumePayment(ticket.paymentId, user.id, event)
  return { url }
})
