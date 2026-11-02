import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FrigearSsoConfig } from '../src/runtime/server/utils/frigear-sso'

let session: { user?: unknown, frigear?: unknown, secure?: Record<string, unknown> } = {}
const setUserSession = vi.fn(async (_event: unknown, data: typeof session) => {
  session = { ...session, ...data, secure: { ...session.secure, ...data.secure } }
  return session
})
const fetchMock = vi.fn()

const sso: FrigearSsoConfig = {
  enabled: true,
  forceId: false,
  syncRole: false,
  keepTokens: true,
  url: 'https://frigear.example',
  clientId: 'client',
  clientSecret: 'secret',
  openidConfig: 'https://frigear.example/.well-known/openid-configuration',
}

vi.stubGlobal('getUserSession', async () => session)
vi.stubGlobal('setUserSession', setUserSession)
vi.stubGlobal('resolveFrigearSso', () => sso)
vi.stubGlobal('loadFrigearOpenIdConfiguration', async () => ({ token_endpoint: 'https://frigear.example/oauth/token' }))
vi.stubGlobal('$fetch', fetchMock)
vi.stubGlobal('verifyFrigearIdToken', async () => ({ sub: '7' }))
vi.stubGlobal('syncFrigearUser', async (profile: { id: number, email: string }) => ({ id: profile.id, email: profile.email, name: 'Ada' }))
vi.stubGlobal('parseRoleClaim', () => undefined)
vi.stubGlobal('parseColorModeClaim', () => undefined)
vi.stubGlobal('mapUserToSession', (user: unknown) => user)
vi.stubGlobal('consumeLoginRedirect', () => '/')
vi.stubGlobal('sendRedirect', async () => undefined)

const { toFrigearSessionTokens, getFrigearAccessToken } = await import('../src/runtime/server/utils/frigear-tokens')
vi.stubGlobal('toFrigearSessionTokens', toFrigearSessionTokens)
const { handleFrigearLogin } = await import('../src/runtime/server/utils/frigear-login')

const event = {} as never
const userinfo = { email: 'ada@example.com' }
const tokenResponse = { id_token: 'id', access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }

beforeEach(() => {
  session = {}
  setUserSession.mockClear()
  fetchMock.mockReset()
})

describe('toFrigearSessionTokens', () => {
  it('reads the access token, refresh token and expiry', () => {
    expect(toFrigearSessionTokens(tokenResponse, 1000)).toEqual({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 3_601_000 })
    expect(toFrigearSessionTokens({ access_token: 'access' })).toEqual({ accessToken: 'access' })
  })

  it('has nothing without an access token', () => {
    expect(toFrigearSessionTokens({ id_token: 'id' })).toBeUndefined()
  })
})

describe('handleFrigearLogin', () => {
  it('keeps the tokens on the sealed session with keepTokens', async () => {
    await handleFrigearLogin(event, sso, userinfo, tokenResponse)
    expect(session.secure?.frigear).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' })
    expect(session.frigear).not.toHaveProperty('accessToken')
  })

  it('keeps no tokens by default', async () => {
    await handleFrigearLogin(event, { ...sso, keepTokens: false }, userinfo, tokenResponse)
    expect(session.secure?.frigear).toBeUndefined()
  })
})

describe('getFrigearAccessToken', () => {
  it('is null without kept tokens', async () => {
    expect(await getFrigearAccessToken(event)).toBeNull()
  })

  it('returns a token that has not expired', async () => {
    session.secure = { frigear: { accessToken: 'access', expiresAt: Date.now() + 3_600_000 } }
    expect(await getFrigearAccessToken(event)).toBe('access')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is null for an expired token without a refresh token', async () => {
    session.secure = { frigear: { accessToken: 'access', expiresAt: Date.now() - 1 } }
    expect(await getFrigearAccessToken(event)).toBeNull()
  })

  it('refreshes an expired token and stores the rotated tokens', async () => {
    session.secure = { frigear: { accessToken: 'old', refreshToken: 'refresh', expiresAt: Date.now() - 1 } }
    fetchMock.mockResolvedValue({ access_token: 'new', refresh_token: 'rotated', expires_in: 60 })
    expect(await getFrigearAccessToken(event)).toBe('new')
    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://frigear.example/oauth/token')
    expect(Object.fromEntries(new URLSearchParams(options.body))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'refresh',
      client_id: 'client',
      client_secret: 'secret',
    })
    expect(session.secure?.frigear).toMatchObject({ accessToken: 'new', refreshToken: 'rotated' })
  })

  it('is null when the refresh fails', async () => {
    session.secure = { frigear: { accessToken: 'old', refreshToken: 'refresh', expiresAt: Date.now() - 1 } }
    fetchMock.mockRejectedValue(new Error('invalid_grant'))
    expect(await getFrigearAccessToken(event)).toBeNull()
    expect(setUserSession).not.toHaveBeenCalled()
  })
})
