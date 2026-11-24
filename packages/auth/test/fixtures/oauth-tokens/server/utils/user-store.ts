// Ada, plus whoever signs in with the fake frigear.nu (the browser handoff creates them).
type StoredUser = { id: number, name: string, email: string, role: string, avatar?: string, emailVerifiedAt?: Date, lastLoginAt?: Date }
const users = new Map<number, StoredUser>([[1, { id: 1, name: 'Ada', email: 'ada@example.com', role: 'user' }]])
const unsupported = async () => {
  throw new Error('The oauth-tokens fixture does not support this.')
}

export default {
  findById: async (id: string | number) => (users.get(Number(id)) ?? null) as never,
  findByEmail: async (email: string) => ([...users.values()].find(user => user.email === email.toLowerCase()) ?? null) as never,
  create: async (values: Omit<StoredUser, 'id' | 'role'> & { id?: number }) => {
    const user = { ...values, id: values.id ?? Math.max(...users.keys()) + 1, role: 'user' }
    users.set(user.id, user)
    return user as never
  },
  update: async (id: string | number, values: Partial<StoredUser>) => {
    const user = users.get(Number(id))
    if (!user) return null as never
    Object.assign(user, values)
    return user as never
  },
  remove: unsupported,
  changeId: unsupported,
}
