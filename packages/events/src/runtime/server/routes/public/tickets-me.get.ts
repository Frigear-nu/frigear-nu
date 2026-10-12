import type { TicketDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<TicketDto[]> => {
  const user = await requireUser(event, { scopes: ['tickets:read'] })
  return listUserTickets(user.id)
})
