import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FrigearSsoConfig } from '../../src/runtime/server/utils/frigear-sso'

// `handleFrigearLogin` with the id token verification and the user sync stubbed: what it trusts from the token
// response and from userinfo.
let verified: Record<string, unknown> = {}
const syncFrigearUser = vi.fn(async (profile: { id: number, email: string, role?: string }) => ({ id: profile.id, email: profile.email, name: 'Ada', role: profile.role }))
const replaceUserSession = vi.fn(async () => ({}))
vi.stubGlobal('createError', (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
vi.stubGlobal('verifyFrigearIdToken', async () => verified)
vi.stubGlobal('syncFrigearUser', syncFrigearUser)
vi.stubGlobal('parseColorModeClaim', () => undefined)
vi.stubGlobal('mapUserToSession', (user: unknown) => user)
vi.stubGlobal('replaceUserSession', replaceUserSession)
vi.stubGlobal('consumeLoginRedirect', () => '/')
vi.stubGlobal('sendRedirect', async () => undefined)
const { parseRoleClaim } = await import('../../src/runtime/server/utils/frigear-role')
vi.stubGlobal('parseRoleClaim', parseRoleClaim)

const { handleFrigearLogin } = await import('../../src/runtime/server/utils/frigear-login')

const sso = { keepTokens: false, syncRole: false, forceId: false, scopes: ['openid', 'profile', 'email'] } as unknown as FrigearSsoConfig
const event = {} as never

beforeEach(() => {
  verified = { sub: '7', email: 'ada@example.com', email_verified: true }
  syncFrigearUser.mockClear()
  replaceUserSession.mockClear()
})

describe('handleFrigearLogin', () => {
  it('signs in with a verified id token, filling in the profile from userinfo about the same user', async () => {
    await handleFrigearLogin(event, sso, { sub: '7', email: 'ada@example.com', name: 'Ada' }, { id_token: 'id' })
    expect(syncFrigearUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@example.com', name: 'Ada', emailVerified: true }), { forceId: false })
    expect(replaceUserSession).toHaveBeenCalledOnce()
  })

  it('uses the id token claims alone when there is no userinfo', async () => {
    await handleFrigearLogin(event, sso, {}, { id_token: 'id' })
    expect(syncFrigearUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@example.com' }), { forceId: false })
  })

  it('refuses a token response without an id token', async () => {
    await expect(handleFrigearLogin(event, sso, { sub: '7', email: 'ada@example.com', email_verified: true }, { access_token: 'access' }))
      .rejects.toMatchObject({ statusCode: 401 })
    expect(syncFrigearUser).not.toHaveBeenCalled()
    expect(replaceUserSession).not.toHaveBeenCalled()
  })

  it('refuses userinfo about another user than the id token', async () => {
    await expect(handleFrigearLogin(event, sso, { sub: '8', email: 'eve@example.com', email_verified: true }, { id_token: 'id' }))
      .rejects.toMatchObject({ statusCode: 401 })
    await expect(handleFrigearLogin(event, sso, { email: 'eve@example.com', email_verified: true }, { id_token: 'id' }))
      .rejects.toMatchObject({ statusCode: 401 })
    expect(syncFrigearUser).not.toHaveBeenCalled()
  })
})
