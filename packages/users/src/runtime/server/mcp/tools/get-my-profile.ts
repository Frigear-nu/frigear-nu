// Self only: there is deliberately no tool that looks up other users. The fields are an allow-list,
// so password hashes, credentials and anything added to the user later are never returned.
// `role` is absent when the host app has no roles.
export default defineScopedMcpTool({
  description: 'Get your own profile (id, name, email and role).',
  scopes: ['profile:read'],
  annotations: { readOnlyHint: true },
  handler: (_args, { user }) => pick(user as { id: number, name: string, email: string, role?: string }, ['id', 'name', 'email', 'role']),
})
