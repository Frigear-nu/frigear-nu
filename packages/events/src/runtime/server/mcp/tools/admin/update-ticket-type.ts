import { patchTicketTypeRow, ticketTypePatchSchema } from '../../../utils/admin'
import { updateTicketTypeShape } from '../../schemas'

export default defineScopedMcpTool({
  description: 'Update fields of an event\'s ticket type, such as price, capacity or sale dates (staff). Only the given fields change.',
  scopes: ['events:manage'],
  gate: canManageEvents,
  annotations: { idempotentHint: true },
  inputSchema: updateTicketTypeShape,
  handler: ({ id, patch }) => patchTicketTypeRow(id, ticketTypePatchSchema.parse(patch)),
})
