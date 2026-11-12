import { idParams } from '@frigear-nu/module-kit/server'
import type { TicketDto } from '../../../../types'

// One of the caller's tickets. Polled by the return page after Stripe: the ticket only reads `paid` once the Stripe
// event arrived.
export default defineEventHandler(async (event): Promise<TicketDto> => {
  const { user } = await authorize(event, 'tickets:read')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  return getUserTicket(user.id, id)
})
