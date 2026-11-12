import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FrigearSsoConfig } from '../../src/runtime/server/utils/frigear-sso'

// `handleFrigearLogin` with the id token verification and the user sync stubbed: what it trusts from the token
// response and from userinfo.
let verified: Record<string, unknown> = {}
const syncFrigearUser = vi.fn(async (profile: { id: number, email: string, roles?: string[] }) => ({ id: profile.id, email: profile.email, name: 'Ada' }))
const replaceUserSession = vi.fn(async () => ({}))
vi.stubGlobal('createError', (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
vi.stubGlobal('verifyFrigearIdToken', async () => verified)
vi.stubGlobal('syncFrigearUser', syncFrigearUser)
vi.stubGlobal('parseColorModeClaim', () => undefined)
vi.stubGlobal('mapUserToSession', (user: unknown) => user)
vi.stubGlobal('replaceUserSession', replaceUserSession)
// `startAuthSession` (session.ts) is the sign-in: a replaced session with the mapped user.
vi.stubGlobal('startAuthSession', (event: unknown, user: unknown, extra: Record<string, unknown> = {}) => {
  const globals = globalThis as unknown as { replaceUserSession: (event: unknown, data: unknown) => unknown, mapUserToSession: (user: unknown) => unknown }
  return globals.replaceUserSession(event, { ...extra, user: globals.mapUserToSession(user) })
})
vi.stubGlobal('consumeLoginRedirect', () => '/')
vi.stubGlobal('sendRedirect', async () => undefined)
const { mapRoleClaims } = await import('../../src/runtime/server/utils/frigear-role')
vi.stubGlobal('mapRoleClaims', mapRoleClaims)

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

describe('handleFrigearLogin roles', () => {
  const syncing = { ...sso, syncRole: true, roleMap: { admin: 'admin', staff: 'manager' }, defaultRole: 'user' } as FrigearSsoConfig
  const rolesOf = () => syncFrigearUser.mock.calls.at(-1)![0].roles

  it('maps the roles of the verified id token through the role map', async () => {
    verified.roles = ['staff', 'admin', 'volunteer']
    await handleFrigearLogin(event, syncing, {}, { id_token: 'id' })
    expect(rolesOf()).toEqual(['manager', 'admin'])
  })

  it('never takes a role from userinfo', async () => {
    await handleFrigearLogin(event, syncing, { sub: '7', role: 'admin' }, { id_token: 'id' })
    expect(rolesOf()).toEqual([])
  })

  it('syncs no single sign-on role when the claim is missing or not in the map', async () => {
    await handleFrigearLogin(event, syncing, {}, { id_token: 'id' })
    expect(rolesOf()).toEqual([])
    verified.role = 'superuser'
    await handleFrigearLogin(event, syncing, {}, { id_token: 'id' })
    expect(rolesOf()).toEqual([])
  })

  it('falls back to a configured default role other than `user`', async () => {
    await handleFrigearLogin(event, { ...syncing, defaultRole: 'guest' } as FrigearSsoConfig, {}, { id_token: 'id' })
    expect(rolesOf()).toEqual(['guest'])
  })

  it('syncs no role when role syncing is off', async () => {
    verified.role = 'admin'
    await handleFrigearLogin(event, sso, {}, { id_token: 'id' })
    expect(rolesOf()).toBeUndefined()
  })
})
