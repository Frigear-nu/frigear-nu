import { insertAddonGroup } from '../../utils/admin'
import { addonGroupInput } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const input = await readValidatedBody(event, addonGroupInput.parse)
  const row = await insertAddonGroup(getRouterParam(event, 'id')!, input).catch((error) => {
    throw createError({ statusCode: 409, statusMessage: 'Could not create the addon group (unknown ticket type?).', cause: error })
  })
  setResponseStatus(event, 201)
  return row
})
