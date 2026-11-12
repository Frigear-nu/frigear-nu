import { idParams } from '@frigear-nu/module-kit/server'
import type { AdminTicketTypeDto } from '../../../../types'
import { authorizeEventsRecord, eventsIdOfTicketType, patchTicketTypeRow, ticketTypePatchSchema } from '../../utils/admin'

export default defineEventHandler(async (event): Promise<AdminTicketTypeDto> => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  await authorizeEventsRecord(event, await eventsIdOfTicketType(id))
  const patch = await readValidatedBody(event, ticketTypePatchSchema.parse)
  return toAdminTicketTypeDto(await patchTicketTypeRow(id, patch))
})
