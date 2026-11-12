import { createEventWithCatalog } from '../../../utils/admin'
import { eventInput } from '../../../utils/admin-schemas'
import { createEventShape } from '../../schemas'
import { ticketTypeToMinor } from '../../money'

export default defineScopedMcpTool({
  description: 'Create an event, optionally with ticket types, addon groups and addons (staff). Prices are in whole currency units (52.2 = 52.20), not cents.',
  permission: 'events:manage',
  annotations: { destructiveHint: false },
  inputSchema: createEventShape,
  handler: args => createEventWithCatalog(eventInput.parse({ ...args, ticketTypes: args.ticketTypes?.map(type => ticketTypeToMinor(type)) })),
})
