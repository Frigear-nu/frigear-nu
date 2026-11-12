import { eventPatchSchema, patchEventRow } from '../../../utils/admin'
import { updateEventShape } from '../../schemas'

export default defineScopedMcpTool({
  description: 'Update fields of an event (staff). Only the given fields change.',
  permission: 'events:manage',
  annotations: { idempotentHint: true },
  inputSchema: updateEventShape,
  handler: ({ id, patch }) => patchEventRow(id, eventPatchSchema.parse(patch)),
})
