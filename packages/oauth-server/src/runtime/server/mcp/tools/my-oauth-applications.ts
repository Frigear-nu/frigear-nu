// Only the caller's own applications, through the same helper as the session route. Client secrets,
// redirect URIs and other users' grants are not part of this DTO.
export default defineScopedMcpTool({
  description: 'List the applications you can sign in to with your frigear account.',
  scopes: ['oauth:read'],
  annotations: { readOnlyHint: true },
  handler: (_args, { event, user }) => listUserApplications(user.id, event),
})
