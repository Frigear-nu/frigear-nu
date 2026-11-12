import { authorizeEventsRecord, eventPatchSchema, patchEventRow } from '../../../utils/admin'
import { updateEventShape } from '../../schemas'

export default defineScopedMcpTool({
  description: 'Update fields of an event (staff). Only the given fields change.',
  permission: 'events:manage',
  annotations: { idempotentHint: true },
  inputSchema: updateEventShape,
  handler: async ({ id, patch }, ctx) => {
    // Policies of `events:manage` see the stored event, as on the HTTP route.
    await authorizeEventsRecord(ctx.event, id)
    return patchEventRow(id, eventPatchSchema.parse(patch))
  },
})
