import { describe, expect, it, vi } from 'vitest'
import type { FrigearSsoConfig } from '../src/runtime/server/utils/frigear-sso'

vi.stubGlobal('cachedFunction', (fn: unknown) => fn)
vi.mock('@nuxthub/db', () => ({ db: {}, schema: {} }))

const { deriveOAuthTokensKey, sealOAuthToken, openOAuthToken, parseOAuthTokenResponse } = await import('../src/runtime/server/utils/oauth-tokens')
const { frigearLoginScopes } = await import('../src/runtime/server/utils/frigear-sso')

describe('token encryption', () => {
  it('round-trips and never stores the plaintext', async () => {
    const key = await deriveOAuthTokensKey('a-secret')
    const sealed = await sealOAuthToken(key, 'access-token', 'frigear')
    expect(sealed).toMatch(/^v1\./)
    expect(sealed).not.toContain('access-token')
    expect(await sealOAuthToken(key, 'access-token', 'frigear')).not.toBe(sealed)
    expect(await openOAuthToken(key, sealed, 'frigear')).toBe('access-token')
  })

  it('does not open with another key, for another provider, or when tampered with', async () => {
    const key = await deriveOAuthTokensKey('a-secret')
    const sealed = await sealOAuthToken(key, 'access-token', 'frigear')
    expect(await openOAuthToken(await deriveOAuthTokensKey('another-secret'), sealed, 'frigear')).toBeNull()
    expect(await openOAuthToken(key, sealed, 'github')).toBeNull()
    expect(await openOAuthToken(key, `${sealed.slice(0, -2)}AA`, 'frigear')).toBeNull()
    expect(await openOAuthToken(key, 'plain', 'frigear')).toBeNull()
  })
})

describe('parseOAuthTokenResponse', () => {
  it('reads the tokens, expiry and granted scopes', () => {
    expect(parseOAuthTokenResponse({ access_token: 'a', refresh_token: 'r', expires_in: 60, token_type: 'Bearer', scope: 'openid users:read' }, [], 1000)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresAt: new Date(61_000),
      scopes: ['openid', 'users:read'],
    })
  })

  it('falls back to the requested scopes and has nothing without an access token', () => {
    expect(parseOAuthTokenResponse({ access_token: 'a' }, ['openid'])).toMatchObject({ scopes: ['openid'], expiresAt: null, refreshToken: undefined })
    expect(parseOAuthTokenResponse({ id_token: 'x' })).toBeUndefined()
  })
})

describe('frigearLoginScopes', () => {
  const sso = { scopes: ['openid', 'profile', 'email'], stepUpScopes: ['users:read'] } as FrigearSsoConfig

  it('adds only allowlisted step-up scopes', () => {
    expect(frigearLoginScopes(sso)).toEqual(['openid', 'profile', 'email'])
    expect(frigearLoginScopes(sso, 'users:read')).toEqual(['openid', 'profile', 'email', 'users:read'])
    expect(frigearLoginScopes(sso, 'users:read users:write,events:admin')).toEqual(['openid', 'profile', 'email', 'users:read'])
    expect(frigearLoginScopes({ ...sso, stepUpScopes: [] }, 'users:read')).toEqual(['openid', 'profile', 'email'])
  })
})

describe('handleFrigearLogin', async () => {
  const storeOAuthTokens = vi.fn()
  vi.stubGlobal('storeOAuthTokens', storeOAuthTokens)
  vi.stubGlobal('parseOAuthTokenResponse', parseOAuthTokenResponse)
  vi.stubGlobal('verifyFrigearIdToken', async () => ({ sub: '7' }))
  vi.stubGlobal('syncFrigearUser', async (profile: { id: number, email: string }) => ({ id: profile.id, email: profile.email, name: 'Ada' }))
  vi.stubGlobal('parseRoleClaim', () => undefined)
  vi.stubGlobal('parseColorModeClaim', () => undefined)
  vi.stubGlobal('mapUserToSession', (user: unknown) => user)
  const replaceUserSession = vi.fn(async () => ({}))
  vi.stubGlobal('setUserSession', async () => {
    throw new Error('A frigear.nu sign-in must replace the session, not merge into it.')
  })
  vi.stubGlobal('replaceUserSession', replaceUserSession)
  vi.stubGlobal('consumeLoginRedirect', () => '/')
  vi.stubGlobal('sendRedirect', async () => undefined)
  const { handleFrigearLogin } = await import('../src/runtime/server/utils/frigear-login')

  const sso = { keepTokens: true, syncRole: false, forceId: false, scopes: ['openid', 'profile', 'email'] } as unknown as FrigearSsoConfig
  const response = { id_token: 'id', access_token: 'access', refresh_token: 'refresh', expires_in: 60, scope: 'openid users:read' }

  it('keeps the tokens of the login with keepTokens', async () => {
    storeOAuthTokens.mockClear()
    await handleFrigearLogin({} as never, sso, { email: 'ada@example.com' }, response)
    expect(storeOAuthTokens).toHaveBeenCalledWith(7, 'frigear', expect.objectContaining({ accessToken: 'access', refreshToken: 'refresh', scopes: ['openid', 'users:read'] }))
    expect(replaceUserSession).toHaveBeenCalled()
  })

  it('keeps nothing without it', async () => {
    storeOAuthTokens.mockClear()
    await handleFrigearLogin({} as never, { ...sso, keepTokens: false }, { email: 'ada@example.com' }, response)
    expect(storeOAuthTokens).not.toHaveBeenCalled()
  })
})
