import { patchTicketTypeRow, ticketTypePatchSchema } from '../../utils/admin'

export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const patch = await readValidatedBody(event, ticketTypePatchSchema.parse)
  return patchTicketTypeRow(getRouterParam(event, 'id')!, patch)
})
