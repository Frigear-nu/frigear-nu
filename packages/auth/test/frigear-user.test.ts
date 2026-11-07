import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mapRoleClaim, parseRoleClaim } from '../src/runtime/server/utils/frigear-role'

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
const clearUnverifiedAuthCredentials = vi.fn()
vi.stubGlobal('useAuthUserStore', () => store)
vi.stubGlobal('clearUnverifiedAuthCredentials', clearUnverifiedAuthCredentials)
vi.stubGlobal('createError', (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))

vi.stubGlobal('cachedFunction', (fn: unknown) => fn)

const { syncFrigearUser } = await import('../src/runtime/server/utils/frigear-user')
const { parseRoleMap } = await import('../src/runtime/server/utils/frigear-sso')

beforeEach(() => {
  rows = []
  store.changeId.mockClear()
  clearUnverifiedAuthCredentials.mockClear()
})

describe('parseRoleClaim', () => {
  it('reads a role string or the first of a roles array', () => {
    expect(parseRoleClaim({ role: ' admin ' })).toBe('admin')
    expect(parseRoleClaim({ roles: ['', 'manager', 'admin'] })).toBe('manager')
    expect(parseRoleClaim({ role: 1, roles: 'admin' })).toBeUndefined()
    expect(parseRoleClaim({ 'https://frigear.nu/claims/role': 'admin' })).toBe('admin')
    expect(parseRoleClaim({})).toBeUndefined()
  })
})

describe('mapRoleClaim', () => {
  const roleMap = { 'admin': 'admin', 'frigear-staff': 'manager' }

  it('maps the first claimed role the map lists', () => {
    expect(mapRoleClaim({ role: 'admin' }, roleMap, 'user')).toBe('admin')
    expect(mapRoleClaim({ roles: ['volunteer', 'frigear-staff'] }, roleMap, 'user')).toBe('manager')
    expect(mapRoleClaim({ 'https://frigear.nu/claims/role': 'admin' }, roleMap, 'user')).toBe('admin')
  })

  it('falls back to the default role for an unknown role or no claim, never keeping one', () => {
    expect(mapRoleClaim({ role: 'superadmin' }, roleMap, 'user')).toBe('user')
    expect(mapRoleClaim({ role: 'constructor' }, roleMap, 'user')).toBe('user')
    expect(mapRoleClaim({}, roleMap, 'member')).toBe('member')
    expect(mapRoleClaim({ role: 'admin' }, {}, 'user')).toBe('user')
  })
})

describe('parseRoleMap', () => {
  it('reads an object or JSON and drops entries that are not role names', () => {
    expect(parseRoleMap({ 'admin': 'admin', 'bad': 1, '': 'x' })).toEqual({ admin: 'admin' })
    expect(parseRoleMap('{"staff":"manager"}')).toEqual({ staff: 'manager' })
    expect(parseRoleMap('not json')).toEqual({})
    expect(parseRoleMap(undefined)).toEqual({})
  })
})

describe('syncFrigearUser roles', () => {
  const profile = { email: 'ada@example.com', name: 'Ada', emailVerified: true }

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

describe('syncFrigearUser email verification', () => {
  const profile = { email: 'ada@example.com', name: 'Ada' }

  it('never links an existing user to an address frigear.nu has not verified', async () => {
    rows.push({ id: 1, email: profile.email, name: 'Ada', role: 'user', emailVerifiedAt: new Date() })
    await expect(syncFrigearUser({ ...profile, role: 'admin' }, { forceId: false })).rejects.toMatchObject({ statusCode: 403, data: { code: 'frigear_email_unverified' } })
    await expect(syncFrigearUser({ ...profile, emailVerified: false, id: 9 }, { forceId: true })).rejects.toMatchObject({ statusCode: 403 })
    expect(store.changeId).not.toHaveBeenCalled()
    expect(rows[0]).toMatchObject({ id: 1, role: 'user' })
  })

  it('creates a user for a free address, verified only when frigear.nu says so', async () => {
    expect((await syncFrigearUser(profile, { forceId: false })).emailVerifiedAt).toBeUndefined()
    expect((await syncFrigearUser({ email: 'bob@example.com', emailVerified: true }, { forceId: false })).emailVerifiedAt).toBeInstanceOf(Date)
  })

  it('clears what was set on an unverified account before marking it verified', async () => {
    rows.push({ id: 1, email: profile.email, name: 'Ada', emailVerifiedAt: null })
    const user = await syncFrigearUser({ ...profile, emailVerified: true }, { forceId: false })
    expect(clearUnverifiedAuthCredentials).toHaveBeenCalledWith(1)
    expect(user.emailVerifiedAt).toBeInstanceOf(Date)

    clearUnverifiedAuthCredentials.mockClear()
    await syncFrigearUser({ ...profile, emailVerified: true }, { forceId: false })
    expect(clearUnverifiedAuthCredentials).not.toHaveBeenCalled()
  })
})

describe('syncFrigearUser with forceId', () => {
  it('does not take over a local user holding the id under another address', async () => {
    rows.push({ id: 42, email: 'l@example.com', name: 'Local' })
    await expect(syncFrigearUser({ id: 42, email: 'r@example.com', name: 'Remote', emailVerified: true }, { forceId: true }))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(rows).toEqual([{ id: 42, email: 'l@example.com', name: 'Local' }])
  })

  it('re-keys a user matched by a verified email, and updates the user with the same id and email', async () => {
    rows.push({ id: 9, email: 'ada@example.com', name: 'Ada', emailVerifiedAt: new Date() })
    store.changeId.mockImplementationOnce(async (from: number, to: number) => {
      rows.find(row => row.id === from)!.id = to
    })
    expect(await syncFrigearUser({ id: 42, email: 'ada@example.com', emailVerified: true }, { forceId: true })).toMatchObject({ id: 42 })
    expect(store.changeId).toHaveBeenCalledWith(9, 42)
    expect(await syncFrigearUser({ id: 42, email: 'ada@example.com' }, { forceId: true })).toMatchObject({ id: 42 })
  })
})
