import { ticketToMajor } from '../money'

export default defineScopedMcpTool({
  description: 'List your own tickets. Amounts and prices are in whole currency units (52.2 = 52.20), not cents.',
  scopes: ['tickets:read'],
  annotations: { readOnlyHint: true },
  handler: async (_args, { user }) => (await listUserTickets(user.id)).map(ticketToMajor),
})
