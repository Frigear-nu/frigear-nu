export interface TestUser { id: number, name: string, role: string }

const store = (): Map<string, TestUser> => {
  const g = globalThis as { __mcpTestUsers?: Map<string, TestUser> }
  return g.__mcpTestUsers ||= new Map([
    ['1', { id: 1, name: 'Ada', role: 'user' }],
    ['2', { id: 2, name: 'Bo', role: 'user' }],
    ['3', { id: 3, name: 'Staff', role: 'admin' }],
  ])
}

export const getTestUser = (id: string) => store().get(id) ?? null

/** Test hook: change a user's stored role (the role provider reads it on every request). */
export function setTestUserRole(id: string, role: string) {
  const user = store().get(id)
  if (user) user.role = role
}
