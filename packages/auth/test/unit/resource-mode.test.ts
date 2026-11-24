import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { precheck } from '../../src/runtime/utils/permissions'
import type { PermissionRegistry } from '../../src/runtime/utils/permissions'

// Resource mode on the server: `getAuth` authenticates bearer credentials only and never reads a session, session-only
// permissions are never granted, and nuxt-auth-utils' session utils are stand-ins.
const resolve = vi.fn()
vi.mock('#auth/resolvers', () => ({ resolvers: [{ name: 'test', jwt: true, order: 50, resolve }] }))
vi.mock('#auth/user-store', () => ({ configured: false }))
vi.mock('../../src/runtime/server/utils/access', () => ({ resolveCredentialPermissions: async (_event: unknown, principal: { permissions?: string[] }) => principal.permissions ?? [] }))

let mode = 'resource'
const headers: Record<string, string> = {}
const getUserSession = vi.fn(async () => ({ user: { id: 7 }, signedInAt: Date.now() }))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { authentication: { mode } }, session: { maxAge: 0 } }))
vi.stubGlobal('getRequestHeader', (_event: unknown, name: string) => headers[name])
vi.stubGlobal('getUserSession', getUserSession)
vi.stubGlobal('setResponseHeader', () => {})

const { getAuth, requireAuth } = await import('../../src/runtime/server/utils/auth')
const noSessions = await import('../../src/runtime/server/no-sessions')

const newEvent = () => ({ context: {} }) as H3Event
// A JWT-shaped string, so the `jwt: true` resolver claims it.
const JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln'

beforeEach(() => {
  resolve.mockReset()
  getUserSession.mockClear()
  delete headers.authorization
  mode = 'resource'
})

describe('getAuth in resource mode', () => {
  it('is anonymous without a bearer token, and never reads the session', async () => {
    expect(await getAuth(newEvent())).toBeNull()
    expect(getUserSession).not.toHaveBeenCalled()
  })

  it('authenticates a bearer token through the resolver', async () => {
    headers.authorization = `Bearer ${JWT}`
    resolve.mockResolvedValue({ kind: 'oauth', user: { id: 1 }, scopes: ['openid'], permissions: ['notes:read'], client: { id: 'app' } })
    expect(await getAuth(newEvent())).toMatchObject({ kind: 'oauth', user: { id: 1 }, permissions: ['notes:read'] })
    expect(getUserSession).not.toHaveBeenCalled()
  })

  it('refuses a token the resolver claims but rejects, without a session fallback', async () => {
    headers.authorization = `Bearer ${JWT}`
    resolve.mockResolvedValue(null)
    const event = newEvent()
    await expect(requireAuth(event)).rejects.toMatchObject({ statusCode: 401 })
    expect(event.context.authRejected).toBe(true)
    expect(getUserSession).not.toHaveBeenCalled()
  })

  it('still reads the cookie session in server mode', async () => {
    mode = 'server'
    expect(await getAuth(newEvent())).toMatchObject({ kind: 'session', user: { id: 7 } })
    expect(getUserSession).toHaveBeenCalledTimes(1)
  })

  it('answers 403 session_required for `requireAuth({ sessionOnly })`, whatever the token', async () => {
    headers.authorization = `Bearer ${JWT}`
    resolve.mockResolvedValue({ kind: 'oauth', user: { id: 1 }, scopes: [], permissions: ['*'], client: { id: 'app' } })
    await expect(requireAuth(newEvent(), { sessionOnly: true })).rejects.toMatchObject({ statusCode: 403, data: { code: 'session_required' } })
  })
})

describe('session-only permissions', () => {
  const registry: PermissionRegistry = {
    permissions: {
      'notes:read': { name: 'notes:read', label: 'Read notes', implicit: true },
      'account:delete': { name: 'account:delete', label: 'Delete your account', sessionOnly: true },
    } as unknown as PermissionRegistry['permissions'],
    aliases: {},
  }

  it('are refused for every bearer credential before roles, hooks or policies run', () => {
    // A first-party token holding every permission of the user (`@frigear-nu/oauth-resource` in resource mode).
    const principal = { kind: 'oauth' as const, permissions: ['notes:read', 'account:delete'] }
    expect(precheck('account:delete', registry, principal)).toMatchObject({ allowed: false, status: 403, code: 'session_required' })
    expect(precheck('notes:read', registry, principal)).toBeNull()
  })
})

describe('the nuxt-auth-utils stand-ins', () => {
  it('never find a session and refuse to start one', async () => {
    const event = newEvent()
    expect(await noSessions.getUserSession(event)).toEqual({})
    expect(await noSessions.clearUserSession(event)).toBe(true)
    await expect(noSessions.setUserSession(event, { user: {} })).rejects.toThrow(/has no cookie sessions/)
    await expect(noSessions.replaceUserSession(event, { user: {} })).rejects.toThrow(/has no cookie sessions/)
    await expect(noSessions.requireUserSession(event)).rejects.toMatchObject({ statusCode: 401 })
  })
})
