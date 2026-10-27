import { getTestUser } from './test-users'

// Only reading is needed here: the fixture exercises bearer credentials, not the sign-in flows.
const unsupported = async () => {
  throw new Error('The api-tokens-custom fixture only reads users.')
}

export default {
  findById: async (id: string | number) => getTestUser(String(id)) as never,
  findByEmail: async () => null,
  create: unsupported,
  update: unsupported,
  remove: unsupported,
  changeId: unsupported,
}
