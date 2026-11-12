import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { defaults as ironDefaults, seal } from 'iron-webcrypto'
import { authApi } from '../src/runtime/utils/api'

const fixture = fileURLToPath(new URL('./fixtures/auth-db', import.meta.url))
const dataDir = `${fixture}/.data`
// nuxt-auth-utils' cookie name and the fixture's `appSecret`.
const SESSION_NAME = 'nuxt-auth-session'
const APP_SECRET = 'a-test-only-app-secret-at-least-32-characters'
const DAY_MS = 86_400_000

/**
 * A session cookie sealed the way Nuxt's `useSession` seals it (`nuxt/server`): iron with a key derived from
 * `appSecret` (HKDF-SHA256, salt `nuxt`, info `nuxt-session:<name>`), the lifetime as the seal's ttl.
 * `ageMs` moves the seal's clock back, as for a cookie kept from back then.
 */
async function sealedSession(data: Record<string, unknown>, ageMs = 0) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(APP_SECRET), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('nuxt'), info: encoder.encode(`nuxt-session:${SESSION_NAME}`) }, key, 256)
  const password = [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  const sealed = await seal({ nuxt: 1, id: crypto.randomUUID(), data }, password, { ...ironDefaults, ttl: 30 * DAY_MS, localtimeOffsetMsec: -ageMs })
  return `${SESSION_NAME}=${sealed}`
}

async function call(method: string, path: string, options: { body?: unknown, cookie?: string, bearer?: string } = {}) {
  return fetch(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

async function login(id: number) {
  const response = await call('POST', '/api/test/login', { body: { id } })
  expect(response.status, await response.clone().text()).toBe(200)
  return response.headers.get('set-cookie')!.split(';')[0]!
}

async function createToken(cookie: string, body: { name?: string, scopes?: string[], expiresInDays?: number | null } = {}) {
  const response = await call('POST', authApi.me.tokens, { cookie, body: { name: 'CI', scopes: ['events:read'], ...body } })
  expect(response.status, await response.clone().text()).toBe(201)
  return await response.json() as { id: string, token: string, prefix: string, last4: string, status: string }
}

describe('auth tokens', async () => {
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir: fixture, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  let ada: string
  let bo: string

  it('authenticates with the session cookie and rejects anonymous callers', async () => {
    ada = await login(1)
    bo = await login(2)

    const me = await call('GET', '/api/test/me', { cookie: ada })
    expect(me.status, await me.clone().text()).toBe(200)
    // A session carries its user's grants: here only the implicit permissions.
    expect(await me.json()).toMatchObject({ kind: 'session', user: { id: 1 }, scopes: ['events:read', 'events:write'] })

    const anonymous = await call('GET', '/api/test/me')
    expect(anonymous.status).toBe(401)
    expect(anonymous.headers.get('www-authenticate')).toBe('Bearer')
    expect((await anonymous.json()).data).toMatchObject({ code: 'unauthorized' })
    await expectApiError(apiClient().json('GET', '/api/test/me'), 401, 'unauthorized')
  })

  it('creates a token, returns the plaintext once and never exposes the hash', async () => {
    const created = await createToken(ada, { name: 'My MCP' })
    expect(created.token).toMatch(/^fnu_/)
    expect(created.prefix).toBe(created.token.slice(0, 8))
    expect(created.last4).toBe(created.token.slice(-4))
    expect(created.status).toBe('ok')
    expect(JSON.stringify(created)).not.toContain('tokenHash')

    const list = await call('GET', authApi.me.tokens, { cookie: ada })
    const body = await list.json() as Array<Record<string, unknown>>
    expect(body.map(token => token.id)).toContain(created.id)
    const listed = JSON.stringify(body)
    expect(listed).not.toContain(created.token)
    expect(listed).not.toContain('tokenHash')
    expect(body.find(token => token.id === created.id)).not.toHaveProperty('token')
  })

  it('lets a bearer token act as its owner, with its scopes', async () => {
    const { token } = await createToken(ada)

    const me = await call('GET', '/api/test/me', { bearer: token })
    expect(me.status, await me.clone().text()).toBe(200)
    expect(await me.json()).toMatchObject({ kind: 'user-token', user: { id: 1, name: 'Ada' }, scopes: ['events:read'] })

    const events = await call('GET', '/api/test/events', { bearer: token })
    expect(events.status).toBe(200)
    expect(await events.json()).toEqual({ userId: 1 })
  })

  it('answers 403 insufficient_scope when a scope is missing', async () => {
    const { token } = await createToken(ada, { scopes: ['events:write'] })
    const response = await call('GET', '/api/test/events', { bearer: token })
    expect(response.status).toBe(403)
    expect((await response.json()).data).toMatchObject({ error: 'insufficient_scope', code: 'insufficient_scope', scopes: ['events:read'] })
    await expectApiError(apiClient({ bearer: token }).json('GET', '/api/test/events'), 403, 'insufficient_scope')
    expect(response.headers.get('www-authenticate')).toContain('insufficient_scope')
  })

  it('only gives wildcards to users who may delegate everything they cover', async () => {
    const api = apiClient({ cookie: ada })
    await expectApiError(api.json('POST', authApi.me.tokens, { name: 'x', scopes: ['events:*'] }), 403, 'insufficient_permission')
    await expectApiError(api.json('POST', authApi.me.tokens, { name: 'x', scopes: ['*'] }), 403, 'insufficient_permission')

    await call('PATCH', '/api/test/user', { body: { id: 2, patch: { role: 'admin' } } })
    const admin = await login(2)
    const wildcard = await createToken(admin, { scopes: ['events:*'] })
    expect((await call('GET', '/api/test/events', { bearer: wildcard.token })).status).toBe(200)
    const full = await createToken(admin, { scopes: ['*'] })
    expect((await call('GET', '/api/test/admin', { bearer: full.token })).status).toBe(200)
    await call('PATCH', '/api/test/user', { body: { id: 2, patch: { role: 'user' } } })
  })

  it('keeps session-only routes closed to every bearer token', async () => {
    const { token } = await createToken(ada, { scopes: ['events:read', 'events:write'] })
    const account = await call('POST', '/api/test/account', { bearer: token })
    expect(account.status).toBe(403)
    expect((await account.json()).data).toMatchObject({ error: 'session_required', code: 'session_required' })
    await expectApiError(apiClient({ bearer: token }).fetch('POST', '/api/test/account'), 403, 'session_required')
    expect((await call('POST', '/api/test/account', { cookie: ada })).status).toBe(200)
  })

  it('does not let a token manage tokens', async () => {
    const { token } = await createToken(ada, { scopes: ['events:read'] })
    const bearer = apiClient({ bearer: token })
    await expectApiError(bearer.json('GET', authApi.me.tokens), 403, 'session_required')
    await expectApiError(bearer.json('POST', authApi.me.tokens, { name: 'x', scopes: ['*'] }), 403, 'session_required')
    await expectApiError(bearer.json('DELETE', authApi.me.token('aut_x')), 403, 'session_required')
    await expectApiError(bearer.json('GET', authApi.scopes), 403, 'session_required')
  })

  it('rejects unknown scopes and invalid bodies', async () => {
    const api = apiClient({ cookie: ada })
    const unknown = await expectApiError(api.json('POST', authApi.me.tokens, { name: 'x', scopes: ['nope:read'] }), 400, 'unknown_scope')
    expect(unknown.data).toMatchObject({ scopes: ['nope:read'] })
    await expectApiError(api.json('POST', authApi.me.tokens, { name: '', scopes: ['events:read'] }), 400)
    await expectApiError(api.json('POST', authApi.me.tokens, { name: 'x', scopes: [] }), 400)
    // At most 50 scopes per token.
    await expectApiError(api.json('POST', authApi.me.tokens, { name: 'x', scopes: Array.from({ length: 51 }, () => 'events:read') }), 400)
  })

  it('lists the grantable scopes', async () => {
    const scopes = await (await call('GET', authApi.scopes, { cookie: ada })).json() as Array<{ name: string }>
    // Not `*`: Ada may not delegate `events:admin`, which it covers.
    expect(scopes.map(scope => scope.name)).toEqual(['events:read', 'events:write'])
  })

  it('only offers and accepts role-restricted scopes to users with that role', async () => {
    const refused = await call('POST', authApi.me.tokens, { cookie: ada, body: { name: 'x', scopes: ['events:admin'] } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ data: { code: 'insufficient_permission', scopes: ['events:admin'] } })

    await call('PATCH', '/api/test/user', { body: { id: 2, patch: { role: 'admin' } } })
    const admin = await login(2)
    const scopes = await (await call('GET', authApi.scopes, { cookie: admin })).json() as Array<{ name: string }>
    expect(scopes.map(scope => scope.name)).toEqual(['*', 'events:read', 'events:write', 'events:admin'])
    expect((await call('POST', authApi.me.tokens, { cookie: admin, body: { name: 'x', scopes: ['events:admin'] } })).status).toBe(201)
    await call('PATCH', '/api/test/user', { body: { id: 2, patch: { role: 'user' } } })
  })

  it('revokes tokens and keeps the audit row', async () => {
    const { id, token } = await createToken(ada)
    expect((await call('GET', '/api/test/me', { bearer: token })).status).toBe(200)

    const revoked = await call('DELETE', authApi.me.token(id), { cookie: ada })
    expect(revoked.status).toBe(204)
    expect(await revoked.text()).toBe('')

    const response = await call('GET', '/api/test/me', { bearer: token })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('invalid_token')

    const list = await apiClient({ cookie: ada }).json<Array<{ id: string, status: string, createdAt: string }>>('GET', authApi.me.tokens)
    expect(list.find(item => item.id === id)?.status).toBe('revoked')
    // Dates are ISO strings.
    expect(list.find(item => item.id === id)?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
  })

  it('treats missing credentials and missing scopes as anonymous for optional routes', async () => {
    expect(await (await call('GET', '/api/test/optional')).json()).toEqual({ userId: null })
    expect(await (await call('GET', '/api/test/optional', { cookie: ada })).json()).toEqual({ userId: 1 })

    const allowed = await createToken(ada, { scopes: ['events:read'] })
    expect(await (await call('GET', '/api/test/optional', { bearer: allowed.token })).json()).toEqual({ userId: 1 })
    const other = await createToken(ada, { scopes: ['events:write'] })
    expect(await (await call('GET', '/api/test/optional', { bearer: other.token })).json()).toEqual({ userId: null })

    // An invalid claimed token is anonymous too, and never borrows the session.
    expect(await (await call('GET', '/api/test/optional', { cookie: ada, bearer: 'fnu_bad' })).json()).toEqual({ userId: null })
  })

  it('rejects expired tokens', async () => {
    const { id, token } = await createToken(ada, { expiresInDays: 30 })
    expect((await call('GET', '/api/test/me', { bearer: token })).status).toBe(200)
    await call('POST', '/api/test/expire', { body: { id } })
    expect((await call('GET', '/api/test/me', { bearer: token })).status).toBe(401)
  })

  it('rejects malformed and unknown tokens', async () => {
    expect((await call('GET', '/api/test/me', { bearer: 'fnu_not-a-real-token' })).status).toBe(401)
    expect((await call('GET', '/api/test/me', { bearer: 'fnu_' })).status).toBe(401)
  })

  it('never falls back to the session when a claimed bearer token is invalid', async () => {
    const response = await call('GET', '/api/test/me', { cookie: ada, bearer: 'fnu_not-a-real-token' })
    expect(response.status).toBe(401)
  })

  it('ignores bearer tokens that no resolver claims, so other schemes keep working', async () => {
    const response = await call('GET', '/api/test/me', { cookie: ada, bearer: 'ffk_some-form-token' })
    expect(response.status).toBe(200)
    expect((await response.json()).kind).toBe('session')
    expect((await call('GET', '/api/test/me', { bearer: 'ffk_some-form-token' })).status).toBe(401)
  })

  it('does not accept tokens in the query string', async () => {
    const { token } = await createToken(ada)
    expect((await call('GET', `/api/test/me?token=${token}&api_key=${token}`)).status).toBe(401)
  })

  it('isolates tokens between users', async () => {
    const { id, token } = await createToken(ada)

    const api = apiClient({ cookie: bo })
    const boList = await api.json<Array<{ id: string }>>('GET', authApi.me.tokens)
    expect(boList.map(item => item.id)).not.toContain(id)
    await expectApiError(api.json('DELETE', authApi.me.token(id)), 404, 'not_found')
    await expectApiError(api.json('DELETE', authApi.me.token('aut_missing')), 404, 'not_found')

    // Bo's attempt changed nothing: the token still works, and acts as Ada.
    const me = await call('GET', '/api/test/me', { bearer: token })
    expect((await me.json()).user.id).toBe(1)
  })

  it('reads the user fresh: a role change applies to the next token request', async () => {
    const { token } = await createToken(bo, { scopes: ['events:read'] })
    expect((await call('GET', '/api/test/role', { bearer: token })).status).toBe(403)

    await call('PATCH', '/api/test/user', { body: { id: 2, patch: { role: 'admin' } } })
    expect((await call('GET', '/api/test/role', { bearer: token })).status).toBe(200)

    await call('PATCH', '/api/test/user', { body: { id: 2, patch: { role: 'user' } } })
    expect((await call('GET', '/api/test/role', { bearer: token })).status).toBe(403)
  })

  it('stops working when the user is gone', async () => {
    const carol = await call('POST', '/api/test/login', { body: { id: 1 } })
    expect(carol.status).toBe(200)
    const { token } = await createToken(bo)
    expect((await call('GET', '/api/test/me', { bearer: token })).status).toBe(200)

    await call('PATCH', '/api/test/user', { body: { id: 2, remove: true } })
    expect((await call('GET', '/api/test/me', { bearer: token })).status).toBe(401)
  })

  it('caps a host resolver\'s bearer by the stored user\'s role, and refuses one whose user is not stored', async () => {
    // The `ghost_` resolver maps every token to an admin with `*` and no frozen permissions: its scopes count within
    // the stored user's permissions, computed per request. Ada is stored as a user, so the mapped role must not count.
    expect((await call('GET', '/api/test/events', { bearer: 'ghost_1' })).status).toBe(200)
    await expectApiError(apiClient({ bearer: 'ghost_1' }).json('GET', '/api/test/admin'), 403, 'insufficient_scope')

    await call('PATCH', '/api/test/user', { body: { id: 1, patch: { role: 'admin' } } })
    expect((await call('GET', '/api/test/admin', { bearer: 'ghost_1' })).status).toBe(200)
    await call('PATCH', '/api/test/user', { body: { id: 1, patch: { role: 'user' } } })

    // No stored user: refused, never capped by the mapped "admin" and never falling back to the session.
    expect((await call('GET', '/api/test/me', { bearer: 'ghost_999' })).status).toBe(401)
    expect((await call('GET', '/api/test/me', { bearer: 'ghost_999', cookie: ada })).status).toBe(401)
  })

  describe('access control', () => {
    const authorizeUrl = (permission: string) => `/api/test/authorize?permission=${encodeURIComponent(permission)}`

    it('answers what the caller may do on GET /api/auth/me/access', async () => {
      await expectApiError(apiClient().json('GET', authApi.me.access), 401, 'unauthorized')
      expect(await apiClient({ cookie: ada }).json('GET', authApi.me.access))
        .toEqual({ kind: 'session', scopes: [], permissions: ['events:read', 'events:write'], roles: [] })

      const { token } = await createToken(ada, { scopes: ['events:read'] })
      // A token without the `profile` scope gets no roles.
      expect(await apiClient({ bearer: token }).json('GET', authApi.me.access))
        .toEqual({ kind: 'user-token', scopes: ['events:read'], permissions: ['events:read'] })

      // Root is an admin through `authorization:roles` only.
      const root = await login(6)
      const access = await apiClient({ cookie: root }).json<{ permissions: string[], roles: string[] }>('GET', authApi.me.access)
      expect(access.roles).toEqual(['admin'])
      expect(access.permissions).toEqual(['account:delete', 'events:admin', 'events:read', 'events:write'])
    })

    it('answers authorize with 401, session_required, insufficient_scope and forbidden', async () => {
      await expectApiError(apiClient().json('GET', authorizeUrl('events:read')), 401, 'unauthorized')
      expect(await apiClient({ cookie: ada }).json('GET', authorizeUrl('events:read'))).toEqual({ ok: true, via: 'role' })
      await expectApiError(apiClient({ cookie: ada }).json('GET', authorizeUrl('events:admin')), 403, 'forbidden')
      // Unknown permissions fail closed.
      await expectApiError(apiClient({ cookie: ada }).json('GET', authorizeUrl('events:nope')), 403, 'forbidden')

      const { token } = await createToken(ada, { scopes: ['events:read'] })
      const bearer = apiClient({ bearer: token })
      await expectApiError(bearer.json('GET', authorizeUrl('account:delete')), 403, 'session_required')
      const scope = await call('GET', authorizeUrl('events:write'), { bearer: token })
      expect(scope.status).toBe(403)
      expect(scope.headers.get('www-authenticate')).toContain('insufficient_scope')
      expect((await scope.json()).data).toMatchObject({ code: 'insufficient_scope', scopes: ['events:write'] })
    })

    it('lets authorization:before allow and deny, and denies when a listener throws', async () => {
      const eve = await login(5)
      expect(await apiClient({ cookie: eve }).json('GET', authorizeUrl('events:admin'))).toEqual({ ok: true, via: 'before' })

      const vote = (value: string) => fetch(authorizeUrl('events:read'), { headers: { 'cookie': ada, 'x-before': value } })
      expect((await vote('allow')).status).toBe(200)
      const denied = await vote('deny')
      expect(denied.status).toBe(403)
      expect((await denied.json()).data).toMatchObject({ code: 'forbidden' })
      expect((await vote('throw')).status).toBe(403)

      // `before` never widens a credential: a token without the permission stays refused.
      const { token } = await createToken(ada, { scopes: ['events:read'] })
      const widened = await fetch(authorizeUrl('events:admin'), { headers: { 'authorization': `Bearer ${token}`, 'x-before': 'allow' } })
      expect(widened.status).toBe(403)
      expect((await widened.json()).data).toMatchObject({ code: 'insufficient_scope' })
    })

    it('lets a user allowed only by authorization:before mint, and use, a token for it', async () => {
      const eve = await login(5)
      const scopes = await apiClient({ cookie: eve }).json<Array<{ name: string }>>('GET', authApi.scopes)
      expect(scopes.map(scope => scope.name)).toEqual(['*', 'events:read', 'events:write', 'events:admin'])
      const created = await createToken(eve, { scopes: ['events:admin'] }) as { token: string, permissions?: string[] }
      expect(created.permissions).toEqual(['events:admin'])
      expect((await call('GET', '/api/test/admin', { bearer: created.token })).status).toBe(200)
    })

    it('freezes a token\'s permissions, still within its user\'s current ones', async () => {
      // Bo is gone by now (an earlier test removed him): Di plays the admin.
      await call('PATCH', '/api/test/user', { body: { id: 4, patch: { role: 'admin' } } })
      const admin = await login(4)
      const created = await createToken(admin, { scopes: ['*'] }) as { token: string, permissions: string[] }
      expect(created.permissions).toEqual(['events:admin', 'events:read', 'events:write'])
      expect((await call('GET', authorizeUrl('events:admin'), { bearer: created.token })).status).toBe(200)
      // Demoted: the frozen set still names it, the roles no longer hold it.
      await call('PATCH', '/api/test/user', { body: { id: 4, patch: { role: 'user' } } })
      await expectApiError(apiClient({ bearer: created.token }).json('GET', authorizeUrl('events:admin')), 403, 'forbidden')
    })

    it('computes the permissions of a token minted before they were frozen, per request', async () => {
      const { token } = await (await call('POST', '/api/test/legacy-token', { body: { userId: 1, scopes: ['*'] } })).json() as { token: string }
      expect(await apiClient({ bearer: token }).json('GET', authApi.me.access))
        .toMatchObject({ kind: 'user-token', scopes: ['*'], permissions: ['events:read', 'events:write'] })
      await expectApiError(apiClient({ bearer: token }).json('GET', authorizeUrl('events:admin')), 403, 'insufficient_scope')

      await call('PATCH', '/api/test/user', { body: { id: 1, patch: { role: 'admin' } } })
      expect((await call('GET', authorizeUrl('events:admin'), { bearer: token })).status).toBe(200)
      await call('PATCH', '/api/test/user', { body: { id: 1, patch: { role: 'user' } } })
    })

    it('enforces the access route rules of /api', async () => {
      await expectApiError(apiClient().json('GET', '/api/test/admin-only'), 401, 'unauthorized')
      await expectApiError(apiClient({ cookie: ada }).json('GET', '/api/test/admin-only'), 403, 'forbidden')
      expect(await apiClient({ cookie: await login(6) }).json('GET', '/api/test/admin-only')).toEqual({ ok: true })
      await expectApiError(apiClient().json('GET', '/api/test/signed-in'), 401, 'unauthorized')
      expect(await apiClient({ cookie: ada }).json('GET', '/api/test/signed-in')).toEqual({ ok: true })
      // A path no rule can be trusted to match is refused before any handler.
      // (fetch resolves dot segments itself, so they are covered by the unit tests.)
      expect((await call('GET', '/api/test%5Cadmin-only', { cookie: ada })).status).toBe(400)
      expect((await call('GET', '/api/test%2Fadmin-only', { cookie: ada })).status).toBe(400)
    })
  })

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie and answers 204', async () => {
      const cookie = await login(1)
      const response = await call('POST', authApi.logout, { cookie })
      expect(response.status, await response.clone().text()).toBe(204)
      const cleared = response.headers.get('set-cookie') ?? ''
      // The session cookie is overwritten with an empty value.
      expect(cleared.split(';')[0]).toBe(`${cookie.split('=')[0]}=`)

      // What the browser keeps afterwards is an anonymous session.
      const next = cleared.split(';')[0]!
      await expectApiError(apiClient({ cookie: next }).json('GET', '/api/test/me'), 401, 'unauthorized')
    })

    it('is never a GET, so a link or a prefetch cannot sign out', async () => {
      const cookie = await login(1)
      // `GET /api/auth/logout` falls through to the OAuth `:provider` route, which knows no provider `logout`.
      await expectApiError(apiClient({ cookie }).json('GET', authApi.logout), 404)
    })
  })

  describe('session lifetime', () => {
    it('gives the session cookie an expiry 30 days out by default', async () => {
      const response = await call('POST', '/api/test/login', { body: { id: 1 } })
      // Nuxt's session cookie carries its lifetime as `Max-Age` (seconds), not `Expires`.
      const maxAge = /max-age=(\d+)/i.exec(response.headers.get('set-cookie') ?? '')?.[1]
      expect(maxAge, 'the session cookie has a lifetime').toBeTruthy()
      expect(Number(maxAge) / 86_400).toBe(30)
    })

    const user = { id: 1, name: 'Ada', role: 'user' }

    it('refuses a session sealed longer ago than the lifetime', async () => {
      const data = { user, sessionVersion: 0, signedInAt: Date.now() - 31 * DAY_MS }
      // Sealed now, a session signed in recently is accepted: the cookie is forged the way the app seals it.
      expect((await call('GET', '/api/test/me', { cookie: await sealedSession({ ...data, signedInAt: Date.now() }) })).status).toBe(200)
      // A validly sealed session from 31 days ago, as a cookie kept from back then would be.
      await expectApiError(apiClient({ cookie: await sealedSession(data, 31 * DAY_MS) }).json('GET', '/api/test/me'), 401, 'unauthorized')
    })

    it('ends a session 30 days after sign-in, however recently it was sealed', async () => {
      // Every write to the session (saving the profile or a preference) reseals it with a fresh ttl, so the seal alone
      // would let an active session last forever. The lifetime runs from `signedInAt`, stamped at sign-in.
      const recent = await sealedSession({ user, sessionVersion: 0, signedInAt: Date.now() - DAY_MS })
      expect((await call('GET', '/api/test/me', { cookie: recent })).status).toBe(200)

      const signedInLongAgo = await sealedSession({ user, sessionVersion: 0, signedInAt: Date.now() - 31 * DAY_MS })
      const response = await call('GET', '/api/test/me', { cookie: signedInLongAgo })
      expect(response.status).toBe(401)
      // The cookie is cleared too.
      expect(response.headers.get('set-cookie')).toMatch(new RegExp(`^${SESSION_NAME}=;`))
    })

    it('refuses a session without a sign-in time', async () => {
      await expectApiError(apiClient({ cookie: await sealedSession({ user, sessionVersion: 0 }) }).json('GET', '/api/test/me'), 401, 'unauthorized')
    })

    it('keeps the sign-in time when the session is written to later', async () => {
      const signedIn = Date.now()
      const cookie = await login(1)
      const written = await call('POST', '/api/test/session-write', { cookie })
      expect(written.status, await written.clone().text()).toBe(200)
      const { before, after } = await written.json() as { before: number, after: number }
      expect(before).toBeGreaterThanOrEqual(signedIn)
      expect(after).toBe(before)
    })
  })

  describe('session principal', () => {
    it('reads the user fresh: a role change applies to the next request of the session', async () => {
      const cookie = await login(1)
      const scopes = async () => (await (await call('GET', authApi.scopes, { cookie })).json() as Array<{ name: string }>).map(scope => scope.name)
      expect((await call('GET', '/api/test/role', { cookie })).status).toBe(403)
      expect(await scopes()).not.toContain('events:admin')

      await call('PATCH', '/api/test/user', { body: { id: 1, patch: { role: 'admin' } } })
      expect((await call('GET', '/api/test/role', { cookie })).status).toBe(200)
      expect(await scopes()).toContain('events:admin')

      await call('PATCH', '/api/test/user', { body: { id: 1, patch: { role: 'user' } } })
      expect((await call('GET', '/api/test/role', { cookie })).status).toBe(403)
      expect(await scopes()).not.toContain('events:admin')
    })

    it('ends the session when its user is gone', async () => {
      const cookie = await login(3)
      expect((await call('GET', '/api/test/me', { cookie })).status).toBe(200)

      await call('PATCH', '/api/test/user', { body: { id: 3, remove: true } })
      const response = await call('GET', authApi.me.tokens, { cookie })
      expect(response.status).toBe(401)
      expect(response.headers.get('set-cookie')).toMatch(new RegExp(`^${SESSION_NAME}=;`))
      // The client's view of the session agrees.
      expect(await (await call('GET', '/api/_auth/session', { cookie })).json()).not.toHaveProperty('user')
    })

    it('ends the session when its id now belongs to an account with another email', async () => {
      const cookie = await login(4)
      expect((await call('GET', '/api/test/me', { cookie })).status).toBe(200)

      await call('PATCH', '/api/test/user', { body: { id: 4, patch: { email: 'someone-else@example.com' } } })
      expect((await call('GET', '/api/test/me', { cookie })).status).toBe(401)
    })

    it('answers the fresh user on the session endpoint', async () => {
      const cookie = await login(1)
      await call('PATCH', '/api/test/user', { body: { id: 1, patch: { role: 'editor' } } })
      expect(await (await call('GET', '/api/_auth/session', { cookie })).json()).toMatchObject({ user: { id: 1, role: 'editor' } })
      await call('PATCH', '/api/test/user', { body: { id: 1, patch: { role: 'user' } } })
    })
  })

  describe('GET /api/auth/bootstrap', () => {
    it('requires a signed-in caller', async () => {
      await expectApiError(apiClient().json('GET', `${authApi.bootstrap}?scope=account`), 401, 'unauthorized')
    })

    it('returns every provider of the scope in one response and leaves a failing one out', async () => {
      const response = await call('GET', `${authApi.bootstrap}?scope=account`, { cookie: ada })
      expect(response.status, await response.clone().text()).toBe(200)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(await response.json()).toEqual({
        'test:profile': { id: 1, name: 'Ada' },
        'test:events': [{ id: 'e1', owner: 1 }],
      })
    })

    it('keeps scopes apart', async () => {
      const response = await call('GET', `${authApi.bootstrap}?scope=admin`, { cookie: ada })
      expect(await response.json()).toEqual({ 'test:admin': { id: 1, name: 'Ada' } })
    })

    it('leaves out what a token may not read', async () => {
      const { token } = await createToken(ada, { scopes: ['events:write'] })
      const response = await call('GET', `${authApi.bootstrap}?scope=account`, { bearer: token })
      expect(response.status, await response.clone().text()).toBe(200)
      expect(await response.json()).toEqual({ 'test:profile': { id: 1, name: 'Ada' } })
    })

    it('rejects a missing or unknown scope', async () => {
      const api = apiClient({ cookie: ada })
      await expectApiError(api.json('GET', authApi.bootstrap), 400, 'bad_request')
      await expectApiError(api.json('GET', `${authApi.bootstrap}?scope=nope`), 404, 'not_found')
      await expectApiError(api.json('GET', `${authApi.bootstrap}?scope=constructor`), 404, 'not_found')
    })

    it('is no longer served at the old path', async () => {
      expect((await call('GET', '/api/_bootstrap?scope=account', { cookie: ada })).headers.get('content-type') ?? '').not.toContain('application/json')
    })
  })
})
