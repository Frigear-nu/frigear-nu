export default defineScopedMcpTool({
  description: 'List the published events.',
  permission: 'tickets:read',
  annotations: { readOnlyHint: true },
  handler: () => listPublishedEvents(),
})
