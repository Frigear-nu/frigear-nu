import { idParams } from '@frigear-nu/module-kit/server'
import type { AdminTicketTypeDto } from '../../../../types'
import { patchTicketTypeRow, ticketTypePatchSchema } from '../../utils/admin'

export default defineEventHandler(async (event): Promise<AdminTicketTypeDto> => {
  await eventsStaff.require(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, ticketTypePatchSchema.parse)
  return toAdminTicketTypeDto(await patchTicketTypeRow(id, patch))
})
