import type { TicketDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<TicketDto[]> => {
  const { user } = await requireUserSession(event)
  return listUserTickets(user.id)
})
