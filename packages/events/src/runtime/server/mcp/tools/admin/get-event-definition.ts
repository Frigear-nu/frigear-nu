import { z } from 'zod'
import { getEventWithTicketTypes } from '../../../utils/admin'

export default defineScopedMcpTool({
  description: 'Get one event with all its ticket types and their ids, whatever its status (staff). Use the ids with update-ticket-type.',
  scopes: ['events:manage'],
  gate: canManageEvents,
  annotations: { readOnlyHint: true },
  inputSchema: { id: z.string().describe('The event id.') },
  handler: ({ id }) => getEventWithTicketTypes(id),
})
