import type { TicketDto } from '../../../../types'

// Polled by the return page after Stripe: the ticket only reads `paid` once the Stripe event arrived.
export default defineEventHandler(async (event): Promise<TicketDto> => {
  const user = await requireUser(event, { scopes: ['tickets:read'] })
  return getUserTicket(user.id, getRouterParam(event, 'id')!)
})
