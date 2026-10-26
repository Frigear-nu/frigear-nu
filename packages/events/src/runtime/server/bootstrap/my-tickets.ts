import type { H3Event } from 'h3'
import type { TicketDto } from '../../../types'

/**
 * The caller's tickets: the body of `GET /api/events/tickets/me` and the account bootstrap's `events:tickets:mine`
 * (the key `useMyTickets()` reads), so both always return the same thing.
 */
export default async function myTickets(event: H3Event): Promise<TicketDto[]> {
  const user = await requireUser(event, { scopes: ['tickets:read'] })
  return listUserTickets(user.id)
}
