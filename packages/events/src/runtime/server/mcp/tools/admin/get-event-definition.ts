import { z } from 'zod'
import { getEventWithTicketTypes } from '../../../utils/admin'
import { eventToMajor } from '../../money'

export default defineScopedMcpTool({
  description: 'Get one event with all its ticket types and their ids, whatever its status (staff). Use the ids with update-ticket-type. Prices are in whole currency units (52.2 = 52.20), not cents.',
  scopes: ['events:manage'],
  gate: canManageEvents,
  annotations: { readOnlyHint: true },
  inputSchema: { id: z.string().describe('The event id.') },
  handler: async ({ id }) => eventToMajor(await getEventWithTicketTypes(id)),
})
