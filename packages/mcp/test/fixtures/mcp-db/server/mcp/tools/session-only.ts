export default defineScopedMcpTool({
  description: 'Only for cookie sessions',
  scopes: ['notes:read'],
  sessionOnly: true,
  handler: (_args, { user }) => ({ id: user.id }),
})
