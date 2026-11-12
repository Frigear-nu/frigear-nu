import { idParams } from '@frigear-nu/module-kit/server'
import type { AdminEventDetailDto } from '../../../../types'
import { authorizeEventsRecord, getEventWithTicketTypes } from '../../utils/admin'
import { eventsAccess } from '../../../access'

// One event with all of its ticket types (including capacity and sale window), whatever its status.
export default defineEventHandler(async (event): Promise<AdminEventDetailDto> => {
  await authorize(event, eventsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  await authorizeEventsRecord(event, id)
  return toAdminEventDetailDto(await getEventWithTicketTypes(id))
})
