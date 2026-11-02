// One fixed user: the fixture exercises kept OAuth tokens, not the sign-in flows.
const ada = { id: 1, name: 'Ada', email: 'ada@example.com', role: 'user' }
const unsupported = async () => {
  throw new Error('The oauth-tokens fixture only reads users.')
}

export default {
  findById: async (id: string | number) => (Number(id) === 1 ? ada : null) as never,
  findByEmail: async () => null,
  create: unsupported,
  update: unsupported,
  remove: unsupported,
  changeId: unsupported,
}
