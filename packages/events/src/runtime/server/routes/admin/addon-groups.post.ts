import { created, idParams } from '@frigear-nu/module-kit/server'
import type { AdminAddonGroupDto } from '../../../../types'
import { authorizeEventsRecord, eventsIdOfTicketType, insertAddonGroup } from '../../utils/admin'
import { addonGroupInput } from '../../utils/admin-schemas'

// Adds an addon group (optionally with its addons) to the ticket type `:id`.
export default defineEventHandler(async (event): Promise<AdminAddonGroupDto> => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, addonGroupInput.parse)
  await authorizeEventsRecord(event, await eventsIdOfTicketType(id))
  return created(event, toAdminAddonGroupDto(await insertAddonGroup(id, input)))
})
