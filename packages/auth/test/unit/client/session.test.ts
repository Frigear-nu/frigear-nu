import { describe, expect, it, vi } from 'vitest'
import { createSessionMapper } from '../../../src/runtime/client/app/utils/session'
import type { SessionMapperOptions, SessionState } from '../../../src/runtime/client/app/utils/session'
import { OAuthConfigError, OAuthSessionError, OAuthTransientError } from '../../../src/runtime/client/core'
import type { AuthClientMapUser, OAuthTokens, UserInfo } from '../../../src/runtime/client/core'
import { jwt } from './helpers'

const expected = { issuer: 'https://id.test', clientId: 'app' }
const claims = (extra: Record<string, unknown> = {}) => ({ iss: 'https://id.test', aud: 'app', sub: '42', name: 'Ada', ...extra })
const stored = (idClaims: Record<string, unknown> | null, sessionId = 's1'): OAuthTokens => ({
  accessToken: 'a', refreshToken: 'r', idToken: idClaims ? jwt(idClaims) : null, tokenType: 'Bearer', expiresAt: 0, scope: 'openid', sessionId,
})

/** A promise to resolve or reject from the test. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => ([resolve, reject] = [res, rej]))
  return { promise, resolve, reject }
}

function setup(options: Partial<SessionMapperOptions> = {}) {
  // Plain boxes stand in for the `useState` refs.
  const state = { status: { value: 'unknown' }, claims: { value: null }, session: { value: null } } as unknown as SessionState
  const hooks = { callHook: vi.fn() }
  const client = { signOutLocally: vi.fn(async () => {}), fetchUserInfo: vi.fn(async (): Promise<UserInfo> => ({ sub: '42', email: 'admin@example.test' })) }
  const onUnauthorized = vi.fn()
  const onError = vi.fn()
  const mapper = createSessionMapper({
    state, hooks, client, expected, mapUser: null, userinfo: false, api: vi.fn(), onUnauthorized, onError, ...options,
  })
  // `useUserSession().loggedIn` / `user`, as the composable computes them.
  const loggedIn = () => state.status.value === 'signed-in' && !!state.session.value?.user
  const user = () => state.session.value?.user as Record<string, unknown> | undefined
  return { state, hooks, client, mapper, loggedIn, user, onUnauthorized, onError }
}

describe('the session (claims mapping)', () => {
  it('signs in with the mapped user and the sign-in\'s session id', async () => {
    const ctx = setup()
    await ctx.mapper.apply(stored(claims()))
    expect(ctx.loggedIn()).toBe(true)
    expect(ctx.state.session.value).toEqual({ id: 's1', user: { id: '42', sub: '42', name: 'Ada' } })
    expect(ctx.client.fetchUserInfo).not.toHaveBeenCalled()
  })

  it('is signed out without tokens', async () => {
    const ctx = setup()
    await ctx.mapper.apply(null)
    expect(ctx.state.status.value).toBe('signed-out')
    expect(ctx.state.session.value).toBeNull()
    expect(ctx.hooks.callHook).not.toHaveBeenCalled()
  })

  it.each([
    ['no id_token', null],
    ['no subject', { iss: 'https://id.test', aud: 'app' }],
    ['another issuer', claims({ iss: 'https://old.test' })],
    ['another client', claims({ aud: 'other' })],
  ])('clears a stored session with %s and reports it, so loggedIn never comes without a user', async (_name, idClaims) => {
    const ctx = setup()
    await ctx.mapper.apply(stored(idClaims))
    expect(ctx.loggedIn()).toBe(false)
    expect(ctx.client.signOutLocally).toHaveBeenCalledWith('no_identity')
    expect(ctx.hooks.callHook).toHaveBeenCalledWith('auth:user-failed', { error: expect.objectContaining({ code: 'no_identity' }) })
  })
})

describe('the session (async mapping)', () => {
  it('holds the claims mapping until the custom mapping resolves, without waiting for it', async () => {
    const result = deferred<Record<string, unknown>>()
    const ctx = setup({ mapUser: () => result.promise })
    await ctx.mapper.apply(stored(claims()))
    expect(ctx.loggedIn()).toBe(true)
    expect(ctx.user()).toEqual({ id: '42', sub: '42', name: 'Ada' })
    result.resolve({ name: 'Ada L.', role: 'admin' })
    await vi.waitFor(() => expect(ctx.user()).toEqual({ id: '42', sub: '42', name: 'Ada L.', role: 'admin' }))
  })

  it('passes the claims, a memoised userinfo and the api to the mapper', async () => {
    const api = vi.fn(async () => ({ team: 'blue' }))
    const mapUser: AuthClientMapUser = async ({ claims, userinfo, api }) => {
      const [a, b] = await Promise.all([userinfo(), userinfo()])
      return { id: claims.sub, email: a.email, same: a === b, team: (await api<{ team: string }>('/api/me')).team }
    }
    const ctx = setup({ mapUser, api })
    await ctx.mapper.apply(stored(claims()), { wait: true })
    expect(ctx.user()).toEqual({ id: '42', sub: '42', email: 'admin@example.test', same: true, team: 'blue' })
    expect(ctx.client.fetchUserInfo).toHaveBeenCalledTimes(1)
    expect(api).toHaveBeenCalledWith('/api/me')
  })

  it('merges userinfo into the default mapping with `userinfo: true`, the id_token\'s subject winning', async () => {
    const ctx = setup({ userinfo: true })
    ctx.client.fetchUserInfo.mockResolvedValue({ sub: '42', email: 'ada@example.test', picture: 'https://img.test/a.png' })
    await ctx.mapper.apply(stored(claims()), { wait: true })
    expect(ctx.user()).toEqual({ id: '42', sub: '42', name: 'Ada', email: 'ada@example.test', avatar: 'https://img.test/a.png' })
  })

  it('drops a result that finishes after logout', async () => {
    const result = deferred<Record<string, unknown>>()
    const ctx = setup({ mapUser: () => result.promise })
    await ctx.mapper.apply(stored(claims()))
    await ctx.mapper.apply(null)
    result.resolve({ role: 'admin' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(ctx.loggedIn()).toBe(false)
    expect(ctx.state.session.value).toBeNull()
  })

  it('drops a result about the previous user after the subject changed', async () => {
    const runs = [deferred<Record<string, unknown>>(), deferred<Record<string, unknown>>()]
    let n = 0
    const ctx = setup({ mapUser: () => runs[n++]!.promise })
    await ctx.mapper.apply(stored(claims()))
    await ctx.mapper.apply(stored(claims({ sub: '43', name: 'Grace' }), 's2'))
    // The new user starts from the claims, not the old user's mapping.
    expect(ctx.user()).toEqual({ id: '43', sub: '43', name: 'Grace' })
    runs[1]!.resolve({ role: 'member' })
    runs[0]!.resolve({ role: 'admin' })
    await vi.waitFor(() => expect(ctx.user()).toEqual({ id: '43', sub: '43', role: 'member' }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(ctx.user()).toEqual({ id: '43', sub: '43', role: 'member' })
  })

  it('keeps the claims mapping and reports a transient failure', async () => {
    const error = new OAuthTransientError('network_error', 'offline')
    const ctx = setup({ mapUser: async () => Promise.reject(error) })
    await ctx.mapper.apply(stored(claims()), { wait: true })
    expect(ctx.user()).toEqual({ id: '42', sub: '42', name: 'Ada' })
    expect(ctx.hooks.callHook).toHaveBeenCalledWith('auth:user-failed', { error })
    expect(ctx.onUnauthorized).not.toHaveBeenCalled()
  })

  it('handles a refused token (401) like `$api` does, and lets `wait` reject', async () => {
    const ctx = setup({ userinfo: true })
    const error = new OAuthSessionError('invalid_token', 'refused', { status: 401 })
    ctx.client.fetchUserInfo.mockRejectedValue(error)
    await expect(ctx.mapper.apply(stored(claims()), { wait: true })).rejects.toBe(error)
    expect(ctx.onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('fails the run and rejects `wait` when a `$api` 401 signed the user out during the mapping', async () => {
    const error = Object.assign(new Error('refused'), { name: 'FetchError', statusCode: 401 })
    const holder = {} as { ctx: ReturnType<typeof setup> }
    // `$api` with `onUnauthorized: 'signOut'`: it signs out locally (the core then reports no tokens), then throws.
    const api = vi.fn(async () => {
      await holder.ctx.mapper.apply(null)
      throw error
    })
    const ctx = holder.ctx = setup({ mapUser: async ({ api }) => api('/api/me'), api })
    await expect(ctx.mapper.apply(stored(claims()), { wait: true })).rejects.toBe(error)
    expect(ctx.hooks.callHook).toHaveBeenCalledWith('auth:user-failed', { error })
    expect(ctx.state.session.value).toBeNull()
  })

  it('runs onUnauthorized for a userinfo 401 after the core ended the session', async () => {
    const error = new OAuthSessionError('invalid_token', 'refused', { status: 401 })
    const ctx = setup({ userinfo: true })
    ctx.client.fetchUserInfo.mockImplementation(async () => {
      await ctx.mapper.apply(null)
      throw error
    })
    await expect(ctx.mapper.apply(stored(claims()), { wait: true })).rejects.toBe(error)
    expect(ctx.onUnauthorized).toHaveBeenCalledTimes(1)
    expect(ctx.hooks.callHook).toHaveBeenCalledWith('auth:user-failed', { error })
  })

  it('returns null from `wait` when the sign-in it mapped is gone', async () => {
    const result = deferred<Record<string, unknown>>()
    const ctx = setup({ mapUser: () => result.promise })
    const waiting = ctx.mapper.apply(stored(claims()), { wait: true })
    await ctx.mapper.apply(null)
    result.resolve({ role: 'admin' })
    expect(await waiting).toBeNull()
  })

  it('maps again on the next refresh after a transient failure', async () => {
    const ctx = setup({ userinfo: true })
    ctx.client.fetchUserInfo.mockRejectedValueOnce(new OAuthTransientError('network_error', 'offline'))
    await ctx.mapper.apply(stored(claims({ iat: 1 })), { wait: true })
    expect(ctx.user()).not.toHaveProperty('email')
    await ctx.mapper.apply(stored(claims({ iat: 2 })), { wait: true })
    expect(ctx.user()).toMatchObject({ email: 'admin@example.test' })
  })

  it('times out a hanging mapping as transient', async () => {
    const ctx = setup({ mapUser: () => new Promise(() => {}), timeoutMs: 5 })
    await ctx.mapper.apply(stored(claims()), { wait: true })
    expect(ctx.hooks.callHook).toHaveBeenCalledWith('auth:user-failed', { error: expect.objectContaining({ code: 'mapping_timeout' }) })
    expect(ctx.user()).toEqual({ id: '42', sub: '42', name: 'Ada' })
  })

  it('falls back to the claims mapping when re-mapping the same user fails for any reason', async () => {
    const ctx = setup({ userinfo: true })
    await ctx.mapper.apply(stored(claims()), { wait: true })
    ctx.client.fetchUserInfo.mockRejectedValue(new OAuthConfigError('userinfo_failed', 'forbidden', { status: 403 }))
    await expect(ctx.mapper.apply(stored(claims({ name: 'Ada L.' })), { wait: true })).rejects.toThrow('forbidden')
    expect(ctx.user()).toEqual({ id: '42', sub: '42', name: 'Ada L.' })
  })

  it('swallows the failure of a stale run', async () => {
    const first = deferred<Record<string, unknown>>()
    let n = 0
    const ctx = setup({ mapUser: () => (n++ === 0 ? first.promise : Promise.resolve({ role: 'member' })) })
    const waiting = ctx.mapper.apply(stored(claims(), 's1'), { wait: true })
    await ctx.mapper.apply(stored(claims(), 's2'), { wait: true })
    first.reject(new TypeError('stale'))
    await expect(waiting).resolves.toBeNull()
    expect(ctx.onError).not.toHaveBeenCalled()
    expect(ctx.user()).toMatchObject({ role: 'member' })
  })

  it.each([
    ['a configuration error', new OAuthConfigError('no_userinfo_endpoint', 'none')],
    ['a mapper that throws', new TypeError('bug')],
  ])('surfaces %s: `wait` rejects, the background reports it', async (_name, error) => {
    const ctx = setup({ mapUser: async () => Promise.reject(error) })
    await expect(ctx.mapper.apply(stored(claims()), { wait: true })).rejects.toBe(error)
    await ctx.mapper.apply(stored(claims()), { force: true })
    await vi.waitFor(() => expect(ctx.onError).toHaveBeenCalledWith(error))
    expect(ctx.user()).toEqual({ id: '42', sub: '42', name: 'Ada' })
  })

  it('rejects a mapper result that is not an object', async () => {
    const ctx = setup({ mapUser: async () => null as never })
    await expect(ctx.mapper.apply(stored(claims()), { wait: true })).rejects.toThrow(/must return an object/)
  })

  describe('the userinfo cache', () => {
    const userinfoCalls = async (steps: (ctx: ReturnType<typeof setup>) => Promise<void>) => {
      const ctx = setup({ userinfo: true })
      await ctx.mapper.apply(stored(claims({ iat: 1, exp: 10 })), { wait: true })
      await steps(ctx)
      return ctx.client.fetchUserInfo.mock.calls.length
    }

    it('survives a refresh that only renewed the token', async () => {
      expect(await userinfoCalls(ctx => ctx.mapper.apply(stored(claims({ iat: 2, exp: 20 }))))).toBe(1)
    })

    it('is dropped by a refresh that changed the claims', async () => {
      expect(await userinfoCalls(ctx => ctx.mapper.apply(stored(claims({ name: 'Ada L.' })), { wait: true }))).toBe(2)
    })

    it('is dropped by `fetch()` (force)', async () => {
      expect(await userinfoCalls(ctx => ctx.mapper.apply(stored(claims()), { force: true, wait: true }))).toBe(2)
    })

    it('is dropped by logout', async () => {
      expect(await userinfoCalls(async (ctx) => {
        await ctx.mapper.apply(null)
        await ctx.mapper.apply(stored(claims()), { wait: true })
      })).toBe(2)
    })

    it('keeps the mapped user of the same subject while it maps again', async () => {
      const ctx = setup({ userinfo: true })
      await ctx.mapper.apply(stored(claims()), { wait: true })
      const next = deferred<UserInfo>()
      ctx.client.fetchUserInfo.mockReturnValue(next.promise)
      await ctx.mapper.apply(stored(claims({ name: 'Ada L.' })))
      expect(ctx.user()).toMatchObject({ email: 'admin@example.test', name: 'Ada' })
      next.resolve({ sub: '42', email: 'owner@example.test' })
      await vi.waitFor(() => expect(ctx.user()).toMatchObject({ email: 'owner@example.test', name: 'Ada L.' }))
    })
  })

  it('maps a new sign-in of the same user again, with a fresh userinfo', async () => {
    const ctx = setup({ userinfo: true })
    await ctx.mapper.apply(stored(claims(), 's1'), { wait: true })
    await ctx.mapper.apply(null)
    await ctx.mapper.apply(stored(claims(), 's2'), { wait: true })
    expect(ctx.client.fetchUserInfo).toHaveBeenCalledTimes(2)
    // Without a logout in between too: another sign-in id is another sign-in.
    await ctx.mapper.apply(stored(claims(), 's3'), { wait: true })
    expect(ctx.client.fetchUserInfo).toHaveBeenCalledTimes(3)
  })

  it('never lets a result of an earlier sign-in land on a later one, and says which sign-in it applied', async () => {
    const runs = [deferred<Record<string, unknown>>(), deferred<Record<string, unknown>>()]
    let n = 0
    const ctx = setup({ mapUser: () => runs[n++]!.promise })
    const first = ctx.mapper.apply(stored(claims(), 's1'), { wait: true })
    await ctx.mapper.apply(stored(claims(), 's2'))
    runs[0]!.resolve({ role: 'admin' })
    // `null`: that sign-in is no longer the session (the plugin fires no `auth:signed-in` for it).
    expect(await first).toBeNull()
    expect(ctx.state.session.value!.id).toBe('s2')
    expect(ctx.user()).not.toHaveProperty('role')
    runs[1]!.resolve({ role: 'member' })
    await vi.waitFor(() => expect(ctx.user()).toMatchObject({ role: 'member' }))
  })

  it('makes `wait` follow a newer run of the same sign-in and reject with its error', async () => {
    const error = new TypeError('second run failed')
    const runs = [deferred<Record<string, unknown>>(), deferred<Record<string, unknown>>()]
    let n = 0
    const ctx = setup({ mapUser: () => runs[n++]!.promise })
    const waiting = ctx.mapper.apply(stored(claims(), 's1'), { wait: true })
    // A refresh with new claims while the first mapping still runs (e.g. caused by its own request).
    await ctx.mapper.apply(stored(claims({ name: 'Ada L.' }), 's1'))
    runs[0]!.resolve({ role: 'admin' })
    let settled = false
    void waiting.then(() => (settled = true), () => (settled = true))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(settled).toBe(false)
    runs[1]!.reject(error)
    await expect(waiting).rejects.toBe(error)
  })

  it('treats `$api` network errors and 5xx as transient, and its 401 as already handled', async () => {
    const fetchError = (statusCode?: number) => Object.assign(new Error('fetch failed'), { name: 'FetchError', statusCode })
    for (const error of [fetchError(), fetchError(503), fetchError(429)]) {
      const ctx = setup({ mapUser: async ({ api }) => api('/api/me'), api: async () => Promise.reject(error) })
      await ctx.mapper.apply(stored(claims()), { wait: true })
      expect(ctx.user()).toEqual({ id: '42', sub: '42', name: 'Ada' })
      expect(ctx.hooks.callHook).toHaveBeenCalledWith('auth:user-failed', { error })
    }
    const refused = setup({ mapUser: async ({ api }) => api('/api/me'), api: async () => Promise.reject(fetchError(401)) })
    await expect(refused.mapper.apply(stored(claims()), { wait: true })).rejects.toThrow('fetch failed')
    expect(refused.onUnauthorized).not.toHaveBeenCalled()
    const forbidden = setup({ mapUser: async ({ api }) => api('/api/me'), api: async () => Promise.reject(fetchError(403)) })
    await expect(forbidden.mapper.apply(stored(claims()), { wait: true })).rejects.toThrow('fetch failed')
  })

  it('falls back to the claims mapping (not a previously mapped profile) when re-mapping fails transiently', async () => {
    const ctx = setup({ userinfo: true })
    await ctx.mapper.apply(stored(claims()), { wait: true })
    expect(ctx.user()).toMatchObject({ email: 'admin@example.test' })
    ctx.client.fetchUserInfo.mockRejectedValue(new OAuthTransientError('network_error', 'offline'))
    await ctx.mapper.apply(stored(claims({ email: 'member@example.test' })), { wait: true })
    expect(ctx.user()).toEqual({ id: '42', sub: '42', name: 'Ada', email: 'member@example.test' })
  })

  it('binds userinfo to the subject of the sign-in it maps', async () => {
    const ctx = setup({ userinfo: true })
    await ctx.mapper.apply(stored(claims()), { wait: true })
    expect(ctx.client.fetchUserInfo).toHaveBeenCalledWith({ subject: '42' })
  })

  it('keeps the issuer\'s subject as the identity whatever the mapper returns', async () => {
    const ctx = setup({ mapUser: async () => ({ id: 123, sub: 'someone-else', name: 'X' }) })
    await ctx.mapper.apply(stored(claims()), { wait: true })
    expect(ctx.user()).toEqual({ id: '42', sub: '42', name: 'X' })
  })
})
