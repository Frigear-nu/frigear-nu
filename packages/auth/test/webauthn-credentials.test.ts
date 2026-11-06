import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import * as authSchema from '../src/runtime/db/schema.sqlite'

// The users table belongs to @frigear-nu/users; this stand-in only has what the passkey routes need from a user.
const users = sqliteTable('users', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerifiedAt: integer({ mode: 'timestamp' }),
})
const schema = { ...authSchema, users }

const client = createClient({ url: ':memory:' })
const db = drizzle(client, { schema })

vi.mock('@nuxthub/db', () => ({ db, schema }))

// Nitro/nuxt-auth-utils auto-imports, stubbed so the handlers can run outside Nuxt.
let session: { user?: { id: number, email: string } } = {}
const setUserSession = vi.fn(async (_event: unknown, data: { user: unknown }) => {
  session = { user: data.user as { id: number, email: string } }
})
vi.stubGlobal('defineWebAuthnRegisterEventHandler', (options: unknown) => options)
vi.stubGlobal('defineWebAuthnAuthenticateEventHandler', (options: unknown) => options)
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useStorage', () => ({ setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() }))
vi.stubGlobal('getUserSession', async () => session)
vi.stubGlobal('requireUserSession', async () => {
  if (!session.user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  return session
})
// `requireAuth` comes from @frigear-nu/auth; passkey management must never be reachable with a bearer token.
const requireAuth = vi.fn(async (_event: unknown, _options?: { sessionOnly?: boolean }) => {
  if (!session.user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  return { kind: 'session', user: session.user }
})
vi.stubGlobal('requireAuth', requireAuth)
vi.stubGlobal('useAuthUserStore', () => ({
  findByEmail: async (email: string) => (await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) })) ?? null,
  findById: async (id: number) => (await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) })) ?? null,
  create: async (values: { name: string, email: string }) => (await db.insert(users).values(values).returning())[0]!,
  remove: async (id: number) => { await db.delete(users).where(eq(users.id, id)) },
}))
vi.stubGlobal('setUserSession', setUserSession)
let verifyEmail = false
vi.stubGlobal('useRuntimeConfig', () => ({ public: { authentication: { verifyEmail } } }))
vi.stubGlobal('mapUserToSession', (user: { id: number, email: string }) => ({ id: user.id, email: user.email }))
vi.stubGlobal('getValidatedRouterParams', async (event: { params: Record<string, string> }, parse: (value: unknown) => unknown) => parse(event.params))
vi.stubGlobal('toPasskeyDto', (await import('../src/runtime/server/utils/passkeys')).toPasskeyDto)

// What h3 needs of an event to set the response status (`noContent`).
const routeEvent = (params: Record<string, string> = {}) => ({ params, node: { res: {} as { statusCode?: number } } })

interface RegisterHandler {
  validateUser: (body: unknown, event: unknown) => Promise<{ userName: string, displayName?: string }>
  onSuccess: (event: unknown, args: { credential: Record<string, unknown>, user: { userName: string, displayName?: string } }) => Promise<void>
}

const credential = (id: string) => ({ id, publicKey: 'pk-' + id, counter: 0, backedUp: true, transports: ['internal'] })

describe('webauthn credential routes', () => {
  let register: RegisterHandler
  let list: (event: unknown) => Promise<Record<string, unknown>[]>
  let remove: (event: unknown) => Promise<null>

  beforeAll(async () => {
    await client.execute('PRAGMA foreign_keys = ON')
    await client.execute(`CREATE TABLE users (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL, email text NOT NULL UNIQUE, emailVerifiedAt integer)`)
    await client.execute(`CREATE TABLE user_credentials (id text PRIMARY KEY NOT NULL, userId integer NOT NULL, publicKey text NOT NULL, counter integer DEFAULT 0 NOT NULL, backedUp integer DEFAULT false NOT NULL, transports text, name text, createdAt integer NOT NULL)`)
    register = (await import('../src/runtime/server/routes/webauthn/register.post')).default as unknown as RegisterHandler
    list = (await import('../src/runtime/server/routes/me/passkeys.get')).default as never
    remove = (await import('../src/runtime/server/routes/me/passkey.delete')).default as never
  })

  beforeEach(async () => {
    session = {}
    verifyEmail = false
    setUserSession.mockClear()
    await client.execute('DELETE FROM user_credentials')
    await client.execute('DELETE FROM users')
  })

  it('creates the user and stores the passkey on registration', async () => {
    await register.onSuccess({}, { credential: credential('cred-1'), user: { userName: 'new@example.com', displayName: 'Laptop' } })

    const users = await db.query.users.findMany()
    expect(users).toHaveLength(1)
    const stored = await db.query.userCredentials.findMany()
    expect(stored).toMatchObject([{ id: 'cred-1', userId: users[0]!.id, name: 'Laptop', backedUp: true, transports: ['internal'] }])
    expect(session.user?.email).toBe('new@example.com')
  })

  it('refuses to sign up an unknown address with a passkey when verifyEmail is on', async () => {
    verifyEmail = true
    await expect(register.onSuccess({}, { credential: credential('cred-1'), user: { userName: 'boss@example.com' } }))
      .rejects.toMatchObject({ statusCode: 403, data: { code: 'email_verification_required' } })

    expect(await db.query.users.findMany()).toHaveLength(0)
    expect(await db.query.userCredentials.findMany()).toHaveLength(0)
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('still adds a passkey to the signed-in account when verifyEmail is on', async () => {
    verifyEmail = true
    const [a] = await db.insert(schema.users).values({ name: 'A', email: 'a@example.com', emailVerifiedAt: new Date() }).returning()
    session = { user: { id: a!.id, email: a!.email } }

    await register.onSuccess({}, { credential: credential('a-1'), user: { userName: 'a@example.com' } })
    expect(await db.query.userCredentials.findMany()).toMatchObject([{ id: 'a-1', userId: a!.id }])
  })

  it('does not leave an orphan user behind when storing the passkey fails', async () => {
    await expect(register.onSuccess({}, {
      credential: { ...credential('cred-1'), publicKey: null },
      user: { userName: 'orphan@example.com' },
    })).rejects.toThrow()

    expect(await db.query.users.findMany()).toHaveLength(0)
  })

  it('refuses to add a passkey to an existing account without a matching session', async () => {
    await db.insert(schema.users).values({ name: 'A', email: 'a@example.com' })
    await expect(register.onSuccess({}, { credential: credential('c'), user: { userName: 'a@example.com' } }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('lists only the session user\'s passkeys and omits the public key', async () => {
    const [a, b] = await db.insert(schema.users).values([{ name: 'A', email: 'a@example.com' }, { name: 'B', email: 'b@example.com' }]).returning()
    await db.insert(schema.userCredentials).values([
      { ...credential('a-1'), userId: a!.id },
      { ...credential('b-1'), userId: b!.id },
    ])
    session = { user: { id: a!.id, email: a!.email } }

    const result = await list(routeEvent())
    expect(result.map(c => c.id)).toEqual(['a-1'])
    expect(Object.keys(result[0]!).sort()).toEqual(['backedUp', 'createdAt', 'id', 'name', 'transports'])
    expect(result[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
  })

  it('removes only the session user\'s own passkeys', async () => {
    const [a, b] = await db.insert(schema.users).values([{ name: 'A', email: 'a@example.com' }, { name: 'B', email: 'b@example.com' }]).returning()
    await db.insert(schema.userCredentials).values([
      { ...credential('a-1'), userId: a!.id },
      { ...credential('b-1'), userId: b!.id },
    ])
    session = { user: { id: a!.id, email: a!.email } }

    await expect(remove(routeEvent({ id: 'b-1' }))).rejects.toMatchObject({ statusCode: 404, data: { code: 'not_found' } })
    const event = routeEvent({ id: 'a-1' })
    expect(await remove(event)).toBeNull()
    expect(event.node.res.statusCode).toBe(204)

    const remaining = await db.query.userCredentials.findMany()
    expect(remaining.map(c => c.id)).toEqual(['b-1'])
  })

  it('requires a session to list or remove passkeys', async () => {
    await expect(list(routeEvent())).rejects.toMatchObject({ statusCode: 401 })
    await expect(remove(routeEvent({ id: 'x' }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('asks for a session-only credential, so bearer tokens cannot manage passkeys', async () => {
    requireAuth.mockClear()
    await expect(list(routeEvent())).rejects.toBeDefined()
    await expect(remove(routeEvent({ id: 'x' }))).rejects.toBeDefined()
    expect(requireAuth).toHaveBeenCalledTimes(2)
    for (const [, options] of requireAuth.mock.calls) expect(options).toEqual({ sessionOnly: true })
  })
})

interface AuthenticateHandler {
  onSuccess: (event: unknown, args: { credential: { id: string, userId: number }, authenticationInfo: { newCounter: number } }) => Promise<void>
  allowCredentials: (event: unknown, userName: string) => Promise<Array<{ id: string }>>
  getCredential: (event: unknown, id: string) => Promise<unknown>
  onError: (event: unknown, error: unknown) => Promise<void>
}

describe('webauthn authenticate route', () => {
  let authenticate: AuthenticateHandler

  beforeAll(async () => {
    authenticate = (await import('../src/runtime/server/routes/webauthn/authenticate.post')).default as unknown as AuthenticateHandler
  })

  beforeEach(async () => {
    session = {}
    verifyEmail = false
    setUserSession.mockClear()
    await client.execute('DELETE FROM user_credentials')
    await client.execute('DELETE FROM users')
  })

  const invalid = { statusCode: 401, data: { code: 'invalid_credentials' } }

  it('answers one generic 401 for an unknown address and for an account without passkeys', async () => {
    await db.insert(schema.users).values({ name: 'A', email: 'a@example.com' })

    const unknown = await authenticate.allowCredentials({}, 'nobody@example.com').catch(error => error)
    const noPasskeys = await authenticate.allowCredentials({}, 'a@example.com').catch(error => error)
    expect(unknown).toMatchObject(invalid)
    expect(noPasskeys).toMatchObject(invalid)
    // Nothing tells the two apart.
    expect(noPasskeys.statusMessage).toBe(unknown.statusMessage)
  })

  it('offers the account\'s passkeys, whatever the case of the address', async () => {
    const [a] = await db.insert(schema.users).values({ name: 'A', email: 'a@example.com' }).returning()
    await db.insert(schema.userCredentials).values({ ...credential('a-1'), userId: a!.id })
    expect(await authenticate.allowCredentials({}, ' A@Example.com ')).toEqual([{ id: 'a-1' }])
  })

  it('answers the generic 401 for an unknown credential and a failed verification', async () => {
    await expect(authenticate.getCredential({}, 'missing')).rejects.toMatchObject(invalid)
    // nuxt-auth-utils hands a failed verification to `onError` as a bare 400 (or a 500).
    await expect(authenticate.onError({}, createError({ statusCode: 400, message: 'Failed to verify registration response' }))).rejects.toMatchObject(invalid)
    const expired = createError({ statusCode: 400, statusMessage: 'Challenge expired.', data: { code: 'challenge_expired' } })
    await expect(authenticate.onError({}, expired)).rejects.toBe(expired)
  })

  it('refuses passkey sign-in to an unverified account when verifyEmail is on, like password login', async () => {
    const [a] = await db.insert(schema.users).values({ name: 'A', email: 'a@example.com' }).returning()
    await db.insert(schema.userCredentials).values({ ...credential('a-1'), userId: a!.id })
    const signIn = () => authenticate.onSuccess({}, { credential: { id: 'a-1', userId: a!.id }, authenticationInfo: { newCounter: 1 } })

    verifyEmail = true
    await expect(signIn()).rejects.toMatchObject({ statusCode: 403, data: { code: 'email_not_verified' } })
    expect(setUserSession).not.toHaveBeenCalled()

    await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, a!.id))
    await signIn()
    expect(session.user?.email).toBe('a@example.com')
  })
})
