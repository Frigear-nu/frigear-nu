export interface TestUser { id: number, name: string, role: string }

const store = (): Map<string, TestUser> => {
  const g = globalThis as { __mcpTestUsers?: Map<string, TestUser> }
  return g.__mcpTestUsers ||= new Map([
    ['1', { id: 1, name: 'Ada', role: 'user' }],
    ['2', { id: 2, name: 'Bo', role: 'user' }],
    ['3', { id: 3, name: 'Staff', role: 'user' }],
  ])
}

export const getTestUser = (id: string) => store().get(id) ?? null
