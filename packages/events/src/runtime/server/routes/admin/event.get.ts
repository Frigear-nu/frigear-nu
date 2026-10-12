import { getEventWithTicketTypes } from '../../utils/admin'

// One event with all of its ticket types (including capacity and sale window), whatever its status.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  return getEventWithTicketTypes(getRouterParam(event, 'id')!)
})
