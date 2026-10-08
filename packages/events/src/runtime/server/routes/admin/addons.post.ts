import { db, schema } from '@nuxthub/db'
import { newId } from '../../../utils'
import { addonInput } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const input = await readValidatedBody(event, addonInput.parse)
  const row = await db.insert(schema.eventAddons)
    .values({ id: newId('adn'), groupId: getRouterParam(event, 'id')!, ...input, description: input.description ?? null, capacity: input.capacity ?? null })
    .returning()
    .catch((error) => {
      throw createError({ statusCode: 409, statusMessage: 'Could not create the addon (unknown group?).', cause: error })
    })
  setResponseStatus(event, 201)
  return row[0]
})
