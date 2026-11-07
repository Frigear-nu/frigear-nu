import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { sealSession } from 'h3'
import { authApi } from '../src/runtime/utils/api'

const fixture = fileURLToPath(new URL('./fixtures/auth-db', import.meta.url))
const dataDir = `${fixture}/.data`
// The fixture's `runtimeConfig.session`: nuxt-auth-utils' cookie name and the test-only password.
const SESSION_NAME = 'nuxt-session'
const SESSION_PASSWORD = 'a-test-only-session-password-at-least-32-chars'

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
    expect(await me.json()).toMatchObject({ kind: 'session', user: { id: 1 }, scopes: ['*'] })

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

  it('honours resource wildcards and full access', async () => {
    const wildcard = await createToken(ada, { scopes: ['events:*'] })
    expect((await call('GET', '/api/test/events', { bearer: wildcard.token })).status).toBe(200)
    const full = await createToken(ada, { scopes: ['*'] })
    expect((await call('GET', '/api/test/events', { bearer: full.token })).status).toBe(200)
  })

  it('keeps session-only routes closed to every bearer token', async () => {
    const { token } = await createToken(ada, { scopes: ['*'] })
    const account = await call('POST', '/api/test/account', { bearer: token })
    expect(account.status).toBe(403)
    expect((await account.json()).data).toMatchObject({ error: 'session_required', code: 'session_required' })
    await expectApiError(apiClient({ bearer: token }).fetch('POST', '/api/test/account'), 403, 'session_required')
    expect((await call('POST', '/api/test/account', { cookie: ada })).status).toBe(200)
  })

  it('does not let a token manage tokens', async () => {
    const { token } = await createToken(ada, { scopes: ['*'] })
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
  })

  it('lists the grantable scopes', async () => {
    const scopes = await (await call('GET', authApi.scopes, { cookie: ada })).json() as Array<{ name: string }>
    expect(scopes.map(scope => scope.name)).toEqual(['*', 'events:read', 'events:write'])
  })

  it('only offers and accepts role-restricted scopes to users with that role', async () => {
    expect((await call('POST', authApi.me.tokens, { cookie: ada, body: { name: 'x', scopes: ['events:admin'] } })).status).toBe(400)

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
    const { token } = await createToken(bo, { scopes: ['*'] })
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
      const expires = /expires=([^;]+)/i.exec(response.headers.get('set-cookie') ?? '')?.[1]
      expect(expires, 'the session cookie has an expiry').toBeTruthy()
      const days = (new Date(expires!).getTime() - Date.now()) / 86_400_000
      expect(days).toBeGreaterThan(29.9)
      expect(days).toBeLessThanOrEqual(30)
    })

    it('refuses a session sealed longer ago than the lifetime', async () => {
      // A validly sealed session that started 31 days ago, as a cookie kept from back then would be.
      const startedAt = Date.now() - 31 * 86_400_000
      const event = { context: { sessions: { [SESSION_NAME]: { id: 'old-session', createdAt: startedAt, data: { user: { id: 1, name: 'Ada', role: 'user' } } } } } }
      const sealed = await sealSession(event as never, { name: SESSION_NAME, password: SESSION_PASSWORD })
      await expectApiError(apiClient({ cookie: `${SESSION_NAME}=${sealed}` }).json('GET', '/api/test/me'), 401, 'unauthorized')
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
