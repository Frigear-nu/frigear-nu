import { describe, expect, it, vi } from 'vitest'
import { applySession } from '../../../src/runtime/client/app/utils/session'
import type { SessionState } from '../../../src/runtime/client/app/utils/session'
import type { OAuthTokens } from '../../../src/runtime/client/core'
import { jwt } from './helpers'

const expected = { issuer: 'https://id.test', clientId: 'app' }
const stored = (claims: Record<string, unknown> | null): OAuthTokens => ({
  accessToken: 'a', refreshToken: 'r', idToken: claims ? jwt(claims) : null, tokenType: 'Bearer', expiresAt: 0, scope: 'openid', sessionId: 's1',
})

function setup() {
  // Plain boxes stand in for the `useState` refs.
  const state = { status: { value: 'unknown' }, claims: { value: null }, session: { value: null } } as unknown as SessionState
  const hooks = { callHook: vi.fn() }
  const client = { signOutLocally: vi.fn(async () => {}) }
  // `useUserSession().loggedIn` / `user`, as the composable computes them.
  const loggedIn = () => state.status.value === 'signed-in' && !!state.session.value?.user
  return { state, hooks, client, loggedIn, apply: (tokens: OAuthTokens | null) => applySession(state, hooks, client, tokens, expected) }
}

describe('applySession', () => {
  it('signs in with the mapped user and the sign-in\'s session id', async () => {
    const ctx = setup()
    await ctx.apply(stored({ iss: 'https://id.test', aud: 'app', sub: '42', name: 'Ada' }))
    expect(ctx.loggedIn()).toBe(true)
    expect(ctx.state.session.value).toEqual({ id: 's1', user: { id: '42', sub: '42', name: 'Ada' } })
    expect(ctx.state.claims.value).toMatchObject({ sub: '42' })
    expect(ctx.client.signOutLocally).not.toHaveBeenCalled()
  })

  it('is signed out without tokens', async () => {
    const ctx = setup()
    await ctx.apply(null)
    expect(ctx.state.status.value).toBe('signed-out')
    expect(ctx.state.session.value).toBeNull()
    expect(ctx.hooks.callHook).not.toHaveBeenCalled()
  })

  it.each([
    ['no id_token', null],
    ['no subject', { iss: 'https://id.test', aud: 'app' }],
    ['another issuer', { iss: 'https://old.test', aud: 'app', sub: '42' }],
    ['another client', { iss: 'https://id.test', aud: 'other', sub: '42' }],
  ])('clears a stored session with %s and reports it, so loggedIn never comes without a user', async (_name, claims) => {
    const ctx = setup()
    await ctx.apply(stored(claims))
    expect(ctx.loggedIn()).toBe(false)
    expect(ctx.state.status.value).toBe('signed-out')
    expect(ctx.client.signOutLocally).toHaveBeenCalledWith('no_identity')
    expect(ctx.hooks.callHook).toHaveBeenCalledWith('auth:user-failed', { error: expect.objectContaining({ code: 'no_identity' }) })
  })
})
