// `notes:wipe` is a `sessionOnly` permission: a bearer credential never holds it, so the tool is hidden and refused.
export default defineScopedMcpTool({
  description: 'Only for cookie sessions',
  permission: 'notes:wipe',
  handler: (_args, { user }) => ({ id: user.id }),
})
