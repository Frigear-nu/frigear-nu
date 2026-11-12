import { db, schema } from '@nuxthub/db'
import { created, idParams } from '@frigear-nu/module-kit/server'
import type { AdminAddonDto } from '../../../../types'
import { newId } from '../../../utils'
import { authorizeEventsRecord, eventsIdOfAddonGroup } from '../../utils/admin'
import { addonInput } from '../../utils/admin-schemas'

// Adds an addon (one choice) to the addon group `:id`.
export default defineEventHandler(async (event): Promise<AdminAddonDto> => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, addonInput.parse)
  await authorizeEventsRecord(event, await eventsIdOfAddonGroup(id))
  const [row] = await db.insert(schema.eventAddons)
    .values({ id: newId('adn'), groupId: id, ...input, description: input.description ?? null, capacity: input.capacity ?? null })
    .returning()
  return created(event, toAdminAddonDto(row!))
})
