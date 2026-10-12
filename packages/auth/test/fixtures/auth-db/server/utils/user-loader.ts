import { getTestUser } from './test-users'

export default async (id: string) => getTestUser(id) as never
