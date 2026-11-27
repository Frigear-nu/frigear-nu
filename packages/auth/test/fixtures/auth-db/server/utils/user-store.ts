import { createTestUser, findTestUserByEmail, getTestUser } from './test-users'

// Reading, and creating through the registration form (`auth:user:created` test in `tokens.test.ts`): the fixture
// exercises bearer credentials and that hook, not the other sign-in flows.
const unsupported = async () => {
  throw new Error('The auth-db fixture only reads and creates users.')
}

export default {
  findById: async (id: string | number) => getTestUser(String(id)) as never,
  findByEmail: async (email: string) => findTestUserByEmail(email) as never,
  create: async (values: { name: string, email: string }) => createTestUser(values) as never,
  update: unsupported,
  remove: unsupported,
  changeId: unsupported,
}
