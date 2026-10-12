import { createEventWithCatalog } from '../../utils/admin'
import { eventInput } from '../../utils/admin-schemas'

// Creates an event, optionally with its whole catalogue (ticket types -> addon groups -> addons).
export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const input = await readValidatedBody(event, eventInput.parse)
  const row = await createEventWithCatalog(input)
  setResponseStatus(event, 201)
  return row
})
