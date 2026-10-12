export default defineScopedMcpTool({
  description: 'List your own tickets.',
  scopes: ['tickets:read'],
  annotations: { readOnlyHint: true },
  handler: (_args, { user }) => listUserTickets(user.id),
})
