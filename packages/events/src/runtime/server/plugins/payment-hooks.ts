import { db, schema } from '@nuxthub/db'
import { and, eq, inArray } from 'drizzle-orm'
import type { PaymentHookContext } from '@frigear-nu/payments'
import { toTicketDtos } from '../utils/catalog'

// Ticket state follows payment state, and payment state only follows verified Stripe events (see
// @frigear-nu/payments), so a ticket can never be paid by a browser redirect alone.
export default defineNitroPlugin((nitro) => {
  const ticketOf = async ({ payment }: PaymentHookContext) => {
    if (payment.referenceType !== 'event_ticket' || !payment.referenceId) return null
    const [row] = await db.select().from(schema.eventTickets).where(eq(schema.eventTickets.id, payment.referenceId)).limit(1)
    return row ?? null
  }

  nitro.hooks.hook('payments:paid', async (ctx) => {
    const ticket = await ticketOf(ctx)
    // A late payment can still revive an expired/cancelled ticket: the customer did pay for it.
    if (!ticket || ticket.status === 'paid') return
    const [updated] = await db.update(schema.eventTickets)
      .set({ status: 'paid', paymentId: ctx.payment.id })
      .where(and(eq(schema.eventTickets.id, ticket.id), inArray(schema.eventTickets.status, ['pending', 'expired', 'cancelled'])))
      .returning()
    if (!updated) return
    const [dto] = await toTicketDtos([updated])
    await nitro.hooks.callHook('events:ticket:paid', { ticket: dto! })
  })

  const release = (status: 'expired') => async (ctx: PaymentHookContext) => {
    const ticket = await ticketOf(ctx)
    if (!ticket) return
    await db.update(schema.eventTickets).set({ status })
      .where(and(eq(schema.eventTickets.id, ticket.id), eq(schema.eventTickets.status, 'pending')))
  }
  nitro.hooks.hook('payments:expired', release('expired'))
  nitro.hooks.hook('payments:failed', release('expired'))

  nitro.hooks.hook('payments:refunded', async (ctx) => {
    if (ctx.payment.status !== 'refunded') return // partial refunds keep the ticket valid
    const ticket = await ticketOf(ctx)
    if (!ticket || ticket.status === 'refunded') return
    const [updated] = await db.update(schema.eventTickets).set({ status: 'refunded' })
      .where(eq(schema.eventTickets.id, ticket.id)).returning()
    if (!updated) return
    const [dto] = await toTicketDtos([updated])
    await nitro.hooks.callHook('events:ticket:refunded', { ticket: dto! })
  })
})
