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
    // Allowed `events:admin` by an `authorization:before` listener only (`server/plugins/access.ts`).
    ['5', { id: 5, name: 'Eve', role: 'user', email: 'eve@example.com' }],
    // An admin through the `authorization:roles` hook only.
    ['6', { id: 6, name: 'Root', role: 'user', email: 'root@example.com' }],
  ])
}

export const getTestUser = (id: string) => store().get(id) ?? null
export const patchTestUser = (id: string, patch: Partial<TestUser>) => {
  const user = store().get(id)
  if (user) store().set(id, { ...user, ...patch })
}
export const deleteTestUser = (id: string) => store().delete(id)
