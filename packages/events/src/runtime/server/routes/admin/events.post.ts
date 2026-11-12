import { created } from '@frigear-nu/module-kit/server'
import type { AdminEventDto } from '../../../../types'
import { createEventWithCatalog } from '../../utils/admin'
import { eventInput } from '../../utils/admin-schemas'

// Creates an event, optionally with its whole catalogue (ticket types -> addon groups -> addons).
export default defineEventHandler(async (event): Promise<AdminEventDto> => {
  await authorize(event, 'events:manage')
  const input = await readValidatedBody(event, eventInput.parse)
  return created(event, toAdminEventDto(await createEventWithCatalog(input)))
})
