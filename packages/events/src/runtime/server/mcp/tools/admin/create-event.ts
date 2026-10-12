import { createEventWithCatalog } from '../../../utils/admin'
import { eventInput } from '../../../utils/admin-schemas'
import { createEventShape } from '../../schemas'

export default defineScopedMcpTool({
  description: 'Create an event, optionally with ticket types, addon groups and addons (staff).',
  scopes: ['events:manage'],
  gate: canManageEvents,
  annotations: { destructiveHint: false },
  inputSchema: createEventShape,
  handler: args => createEventWithCatalog(eventInput.parse(args)),
})
