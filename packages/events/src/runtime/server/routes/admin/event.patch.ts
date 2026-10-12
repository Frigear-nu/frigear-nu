import { eventPatchSchema, patchEventRow } from '../../utils/admin'

export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const patch = await readValidatedBody(event, eventPatchSchema.parse)
  return patchEventRow(getRouterParam(event, 'id')!, patch)
})
