import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseRoleClaim } from '../src/runtime/server/utils/frigear-role'

type Row = { id: number, email: string, name: string, role?: string, emailVerifiedAt?: Date | null }
let rows: Row[] = []

const store = {
  findByEmail: async (email: string) => rows.find(row => row.email === email) ?? null,
  findById: async (id: number) => rows.find(row => row.id === id) ?? null,
  create: async (values: Partial<Row> & { email: string, name: string }) => {
    const row = { id: values.id ?? rows.length + 1, ...values } as Row
    rows.push(row)
    return row
  },
  update: async (id: number, values: Partial<Row>) => {
    const row = rows.find(entry => entry.id === id)!
    Object.assign(row, Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)))
    return row
  },
  changeId: vi.fn(),
}
vi.stubGlobal('useAuthUserStore', () => store)
vi.stubGlobal('createError', (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))

const { syncFrigearUser } = await import('../src/runtime/server/utils/frigear-user')

beforeEach(() => {
  rows = []
})

describe('parseRoleClaim', () => {
  it('reads a role string or the first of a roles array', () => {
    expect(parseRoleClaim({ role: ' admin ' })).toBe('admin')
    expect(parseRoleClaim({ roles: ['', 'manager', 'admin'] })).toBe('manager')
    expect(parseRoleClaim({ role: 1, roles: 'admin' })).toBeUndefined()
    expect(parseRoleClaim({})).toBeUndefined()
  })
})

describe('syncFrigearUser roles', () => {
  const profile = { email: 'ada@example.com', name: 'Ada' }

  it('creates a new user with the role frigear.nu reports', async () => {
    const user = await syncFrigearUser({ ...profile, role: 'admin' }, { forceId: false })
    expect(user.role).toBe('admin')
  })

  it('updates an existing user to the role frigear.nu reports at every login', async () => {
    rows.push({ id: 1, email: profile.email, name: 'Ada', role: 'user' })
    expect((await syncFrigearUser({ ...profile, role: 'admin' }, { forceId: false })).role).toBe('admin')
    expect((await syncFrigearUser({ ...profile, role: 'user' }, { forceId: false })).role).toBe('user')
  })

  it('leaves the stored role alone when no role is reported', async () => {
    rows.push({ id: 1, email: profile.email, name: 'Ada', role: 'manager' })
    expect((await syncFrigearUser(profile, { forceId: false })).role).toBe('manager')
  })
})
