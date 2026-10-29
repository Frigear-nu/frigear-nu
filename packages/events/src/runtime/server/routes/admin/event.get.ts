import { idParams } from '@frigear-nu/module-kit/server'
import type { AdminEventDetailDto } from '../../../../types'
import { getEventWithTicketTypes } from '../../utils/admin'

// One event with all of its ticket types (including capacity and sale window), whatever its status.
export default defineEventHandler(async (event): Promise<AdminEventDetailDto> => {
  await eventsStaff.require(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  return toAdminEventDetailDto(await getEventWithTicketTypes(id))
})
