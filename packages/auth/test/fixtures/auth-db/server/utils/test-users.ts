export interface TestUser { id: number, name: string, role: string, email?: string }

// In-memory stand-in for the users module, which sits above `auth` and so is not available here.
const store = (): Map<string, TestUser> => {
  const g = globalThis as { __authTestUsers?: Map<string, TestUser> }
  return g.__authTestUsers ||= new Map([
    ['1', { id: 1, name: 'Ada', role: 'user' }],
    ['2', { id: 2, name: 'Bo', role: 'user' }],
    // Signed in, then deleted or given to someone else by `tokens.test.ts`' session suite.
    ['3', { id: 3, name: 'Cy', role: 'user', email: 'cy@example.com' }],
    ['4', { id: 4, name: 'Di', role: 'user', email: 'di@example.com' }],
  ])
}

export const getTestUser = (id: string) => store().get(id) ?? null
export const patchTestUser = (id: string, patch: Partial<TestUser>) => {
  const user = store().get(id)
  if (user) store().set(id, { ...user, ...patch })
}
export const deleteTestUser = (id: string) => store().delete(id)
