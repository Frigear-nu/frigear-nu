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
  const client = { signOutLocally: vi.fn(async () => {}), fetchUserInfo: vi.fn(async (): Promise<UserInfo> => ({ sub: '42', role: 'admin' })) }
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
      return { id: claims.sub, role: a.role, same: a === b, team: (await api<{ team: string }>('/api/me')).team }
    }
    const ctx = setup({ mapUser, api })
    await ctx.mapper.apply(stored(claims()), { wait: true })
    expect(ctx.user()).toEqual({ id: '42', sub: '42', role: 'admin', same: true, team: 'blue' })
    expect(ctx.client.fetchUserInfo).toHaveBeenCalledTimes(1)
    expect(api).toHaveBeenCalledWith('/api/me')
  })

  it('merges userinfo into the default mapping with `userinfo: true`, the id_token\'s subject winning', async () => {
    const ctx = setup({ userinfo: true })
    ctx.client.fetchUserInfo.mockResolvedValue({ sub: '42', email: 'ada@example.test', picture: 'https://img.test/a.png', role: 'admin' })
    await ctx.mapper.apply(stored(claims()), { wait: true })
    expect(ctx.user()).toEqual({ id: '42', sub: '42', name: 'Ada', email: 'ada@example.test', avatar: 'https://img.test/a.png', role: 'admin' })
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

  it('handles a refused token (401) like `$api` does', async () => {
    const ctx = setup({ userinfo: true })
    ctx.client.fetchUserInfo.mockRejectedValue(new OAuthSessionError('invalid_token', 'refused', { status: 401 }))
    await ctx.mapper.apply(stored(claims()), { wait: true })
    expect(ctx.onUnauthorized).toHaveBeenCalledTimes(1)
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
      expect(ctx.user()).toMatchObject({ role: 'admin', name: 'Ada' })
      next.resolve({ sub: '42', role: 'owner' })
      await vi.waitFor(() => expect(ctx.user()).toMatchObject({ role: 'owner', name: 'Ada L.' }))
    })
  })
})
