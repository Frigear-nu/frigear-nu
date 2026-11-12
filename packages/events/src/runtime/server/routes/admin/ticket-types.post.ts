import { created, idParams } from '@frigear-nu/module-kit/server'
import type { AdminTicketTypeDto } from '../../../../types'
import { assertMembershipAvailable, assertTicketTypeKeyFree, authorizeEventsRecord, insertTicketType } from '../../utils/admin'
import { ticketTypeInput } from '../../utils/admin-schemas'

// Adds a ticket type (optionally with its addon groups and addons) to the event `:id`.
export default defineEventHandler(async (event): Promise<AdminTicketTypeDto> => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, ticketTypeInput.parse)
  await authorizeEventsRecord(event, id)
  await assertMembershipAvailable(input)
  await assertTicketTypeKeyFree(id, input.key)
  return created(event, toAdminTicketTypeDto(await insertTicketType(id, input)))
})
