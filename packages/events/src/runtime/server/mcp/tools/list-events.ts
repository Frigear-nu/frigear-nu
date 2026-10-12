export default defineScopedMcpTool({
  description: 'List the published events.',
  scopes: ['tickets:read'],
  annotations: { readOnlyHint: true },
  handler: () => listPublishedEvents(),
})
