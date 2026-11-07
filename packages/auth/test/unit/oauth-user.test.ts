import { beforeEach, describe, expect, it, vi } from 'vitest'

// `handleOAuthUser` against a stubbed user store: which provider profiles may link to (or create) a local account.
vi.mock('#auth/oauth', () => ({ handlers: {}, settings: {} }))

type Row = { id: number, email: string, name: string, password?: string | null, emailVerifiedAt?: Date | null }
let rows: Row[] = []
let redirects: string[] = []
let sessions: unknown[] = []

const store = {
  findByEmail: async (email: string) => rows.find(row => row.email === email) ?? null,
  create: async (values: Omit<Row, 'id'>) => {
    const row = { id: rows.length + 1, ...values }
    rows.push(row)
    return row
  },
  update: async (id: number, values: Partial<Row>) => Object.assign(rows.find(row => row.id === id)!, values),
}
const clearUnverifiedAuthCredentials = vi.fn(async (id: number) => {
  rows.find(row => row.id === id)!.password = null
})
vi.stubGlobal('useAuthUserStore', () => store)
vi.stubGlobal('clearUnverifiedAuthCredentials', clearUnverifiedAuthCredentials)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { authentication: { pages: { login: '/login' } } } }))
vi.stubGlobal('isInternalPath', (path: unknown) => typeof path === 'string' && path.startsWith('/'))
vi.stubGlobal('sendRedirect', (_event: unknown, to: string) => {
  redirects.push(to)
  return to
})
// A sign-in replaces the session; merging (`setUserSession`) would keep the previous user's fields.
vi.stubGlobal('setUserSession', async (_event: unknown, data: unknown) => {
  sessions.push({ merged: data })
})
vi.stubGlobal('replaceUserSession', async (_event: unknown, data: unknown) => {
  sessions.push(data)
})
vi.stubGlobal('mapUserToSession', (user: Row) => ({ id: user.id, email: user.email }))
vi.stubGlobal('consumeLoginRedirect', () => '/')

const { handleOAuthUser, isOAuthEmailVerified } = await import('../../src/runtime/server/utils/oauth')
const event = {} as never

beforeEach(() => {
  rows = [{ id: 1, email: 'victim@example.com', name: 'Victim', password: 'hash', emailVerifiedAt: new Date() }]
  redirects = []
  sessions = []
  clearUnverifiedAuthCredentials.mockClear()
})

describe('isOAuthEmailVerified', () => {
  it('only trusts a positive flag, per provider', () => {
    expect(isOAuthEmailVerified('discord', { email: 'a@x', verified: true })).toBe(true)
    expect(isOAuthEmailVerified('discord', { email: 'a@x', verified: false })).toBe(false)
    expect(isOAuthEmailVerified('discord', { email: 'a@x', email_verified: true })).toBe(false)
    expect(isOAuthEmailVerified('google', { email: 'a@x', email_verified: true })).toBe(true)
    expect(isOAuthEmailVerified('google', { email: 'a@x', verified_email: true })).toBe(true)
    expect(isOAuthEmailVerified('google', { email: 'a@x' })).toBe(false)
    expect(isOAuthEmailVerified('cognito', { email: 'a@x', email_verified: 'true' })).toBe(true)
    expect(isOAuthEmailVerified('oidc', { email: 'a@x' })).toBe(false)
    expect(isOAuthEmailVerified('github', { email: 'a@x' })).toBe(true)
    expect(isOAuthEmailVerified('github', { email: 'a@x', email_verified: false })).toBe(false)
    expect(isOAuthEmailVerified('facebook', { email: 'a@x' })).toBe(false)
    expect(isOAuthEmailVerified('facebook', { email: 'a@x' }, { trustEmail: true })).toBe(true)
  })
})

describe('handleOAuthUser', () => {
  it('refuses a Discord profile whose email is not verified, and links nothing', async () => {
    await handleOAuthUser(event, 'discord', { email: 'victim@example.com', verified: false })
    expect(redirects).toEqual(['/login?error=oauth-unverified'])
    expect(sessions).toEqual([])
  })

  it('refuses a provider that sends no verification flag, for existing and new addresses', async () => {
    await handleOAuthUser(event, 'facebook', { email: 'victim@example.com' })
    await handleOAuthUser(event, 'facebook', { email: 'new@example.com' })
    expect(redirects).toEqual(['/login?error=oauth-unverified', '/login?error=oauth-unverified'])
    expect(sessions).toEqual([])
    expect(rows).toHaveLength(1)
  })

  it('links a flag-less provider with trustEmail', async () => {
    await handleOAuthUser(event, 'facebook', { email: 'victim@example.com' }, { trustEmail: true })
    expect(sessions).toEqual([{ user: { id: 1, email: 'victim@example.com' } }])
  })

  it('starts a fresh session instead of merging into the previous one', async () => {
    await handleOAuthUser(event, 'google', { email: 'victim@example.com', email_verified: true })
    expect(sessions).toEqual([{ user: { id: 1, email: 'victim@example.com' } }])
  })

  it('creates a new account from a verified email as verified', async () => {
    await handleOAuthUser(event, 'google', { email: 'New@Example.com', email_verified: true, name: 'New' })
    expect(rows[1]).toMatchObject({ email: 'new@example.com', emailVerifiedAt: expect.any(Date) })
    expect(redirects).toEqual(['/'])
  })

  it('clears the credentials of an unverified account before signing its owner in', async () => {
    rows[0]!.emailVerifiedAt = null
    await handleOAuthUser(event, 'google', { email: 'victim@example.com', email_verified: true })
    expect(clearUnverifiedAuthCredentials).toHaveBeenCalledWith(1, event)
    expect(rows[0]).toMatchObject({ password: null, emailVerifiedAt: expect.any(Date) })
  })

  it('leaves a verified account alone', async () => {
    await handleOAuthUser(event, 'google', { email: 'victim@example.com', email_verified: true })
    expect(clearUnverifiedAuthCredentials).not.toHaveBeenCalled()
    expect(rows[0]!.password).toBe('hash')
  })
})
