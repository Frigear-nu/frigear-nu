import { insertTicketType } from '../../utils/admin'
import { ticketTypeInput } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const input = await readValidatedBody(event, ticketTypeInput.parse)
  const row = await insertTicketType(getRouterParam(event, 'id')!, input).catch((error) => {
    throw createError({ statusCode: 409, statusMessage: 'Could not create the ticket type (unknown event, or the key is taken).', cause: error })
  })
  setResponseStatus(event, 201)
  return row
})
