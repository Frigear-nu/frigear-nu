import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../src/runtime/db/schema.sqlite'

const client = createClient({ url: ':memory:' })
const db = drizzle(client, { schema })

vi.mock('@nuxthub/db', () => ({ db, schema }))

// Nitro/nuxt-auth-utils auto-imports, stubbed so the handlers can run outside Nuxt.
let session: { user?: { id: number, email: string } } = {}
const setUserSession = vi.fn(async (_event: unknown, data: { user: unknown }) => {
  session = { user: data.user as { id: number, email: string } }
})
vi.stubGlobal('defineWebAuthnRegisterEventHandler', (options: unknown) => options)
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useStorage', () => ({ setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() }))
vi.stubGlobal('getUserSession', async () => session)
vi.stubGlobal('requireUserSession', async () => {
  if (!session.user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  return session
})
vi.stubGlobal('setUserSession', setUserSession)
vi.stubGlobal('mapUserToSession', (user: { id: number, email: string }) => ({ id: user.id, email: user.email }))
vi.stubGlobal('getRouterParam', (event: { params: Record<string, string> }, name: string) => event.params[name])
vi.stubGlobal('createError', (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))

interface RegisterHandler {
  validateUser: (body: unknown, event: unknown) => Promise<{ userName: string, displayName?: string }>
  onSuccess: (event: unknown, args: { credential: Record<string, unknown>, user: { userName: string, displayName?: string } }) => Promise<void>
}

const credential = (id: string) => ({ id, publicKey: 'pk-' + id, counter: 0, backedUp: true, transports: ['internal'] })

describe('webauthn credential routes', () => {
  let register: RegisterHandler
  let list: (event: unknown) => Promise<Record<string, unknown>[]>
  let remove: (event: unknown) => Promise<{ success: boolean }>

  beforeAll(async () => {
    await client.execute('PRAGMA foreign_keys = ON')
    await client.execute(`CREATE TABLE users (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL, email text NOT NULL UNIQUE, password text, avatar text, emailVerifiedAt integer, lastLoginAt integer, createdAt integer NOT NULL, updatedAt integer NOT NULL)`)
    await client.execute(`CREATE TABLE user_credentials (id text PRIMARY KEY NOT NULL, userId integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, publicKey text NOT NULL, counter integer DEFAULT 0 NOT NULL, backedUp integer DEFAULT false NOT NULL, transports text, name text, createdAt integer NOT NULL)`)
    register = (await import('../src/runtime/server/routes/auth/webauthn/register.post')).default as unknown as RegisterHandler
    list = (await import('../src/runtime/server/routes/auth/webauthn/credentials/index.get')).default as never
    remove = (await import('../src/runtime/server/routes/auth/webauthn/credentials/[id].delete')).default as never
  })

  beforeEach(async () => {
    session = {}
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

    const result = await list({})
    expect(result.map(c => c.id)).toEqual(['a-1'])
    expect(result[0]).not.toHaveProperty('publicKey')
  })

  it('removes only the session user\'s own passkeys', async () => {
    const [a, b] = await db.insert(schema.users).values([{ name: 'A', email: 'a@example.com' }, { name: 'B', email: 'b@example.com' }]).returning()
    await db.insert(schema.userCredentials).values([
      { ...credential('a-1'), userId: a!.id },
      { ...credential('b-1'), userId: b!.id },
    ])
    session = { user: { id: a!.id, email: a!.email } }

    await expect(remove({ params: { id: 'b-1' } })).rejects.toMatchObject({ statusCode: 404 })
    expect(await remove({ params: { id: 'a-1' } })).toEqual({ success: true })

    const remaining = await db.query.userCredentials.findMany()
    expect(remaining.map(c => c.id)).toEqual(['b-1'])
  })

  it('requires a session to list or remove passkeys', async () => {
    await expect(list({})).rejects.toMatchObject({ statusCode: 401 })
    await expect(remove({ params: { id: 'x' } })).rejects.toMatchObject({ statusCode: 401 })
  })
})
