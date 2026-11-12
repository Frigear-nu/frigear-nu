import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OAuthResourceAccessToken } from '../src/types'

// What a foreign token may do: its `permissions` claim, or with `introspection` the issuer's live answer.
const introspection = { endpoint: '', clientId: '', clientSecret: 'secret', cacheTtl: 30 }
let answers: Record<string, unknown> = {}
let calls: { url: string, body: string, authorization: string }[] = []

vi.mock('#auth/permissions', () => ({
  registry: {
    permissions: {
      'vouchers:read': { name: 'vouchers:read', resource: 'vouchers', group: 'vouchers', sensitive: false, sessionOnly: false, implicit: false, aliases: [], grantTo: [] },
    },
    aliases: {},
  },
  namedScopes: {},
}))
vi.stubGlobal('useRuntimeConfig', () => ({
  oauthResource: { issuer: 'https://frigear.example.test', audience: 'frigear-services', jwksUrl: '', userinfoUrl: '', corsOrigins: '', corsPaths: '', forceId: false, jwksCacheTtl: 600, introspection },
}))
vi.stubGlobal('$fetch', async (url: string, options: { body: string, headers: { authorization: string } }) => {
  calls.push({ url, body: options.body, authorization: options.headers.authorization })
  const token = new URLSearchParams(options.body).get('token')!
  if (token === 'down') throw new Error('issuer down')
  return answers[token] ?? { active: false }
})

const { resolveOAuthResourcePermissions } = await import('../src/runtime/server/utils/oauth-resource')
const payload = (extra: Partial<OAuthResourceAccessToken> = {}) => ({
  sub: '7', iss: 'https://frigear.example.test', aud: 'frigear-services', exp: Math.floor(Date.now() / 1000) + 600, client_id: 'app', ...extra,
}) as OAuthResourceAccessToken

beforeEach(() => {
  introspection.clientId = ''
  answers = {}
  calls = []
})

describe('resolveOAuthResourcePermissions', () => {
  it('takes the claim, else the scopes against this service\'s permissions, and refuses a malformed claim', async () => {
    expect(await resolveOAuthResourcePermissions('t', payload({ permissions: ['vouchers:read', 'shop:order'] }), ['openid'])).toEqual(['vouchers:read', 'shop:order'])
    expect(await resolveOAuthResourcePermissions('t', payload({ permissions: [] }), ['vouchers:read'])).toEqual([])
    expect(await resolveOAuthResourcePermissions('t', payload(), ['openid', 'vouchers:read', 'shop:order'])).toEqual(['vouchers:read'])
    expect(await resolveOAuthResourcePermissions('t', payload({ permissions: 'vouchers:read' as unknown as string[] }), [])).toBeNull()
    expect(calls).toEqual([])
  })

  it('asks the issuer with the client credentials when introspection is on, and caches the answer per token', async () => {
    introspection.clientId = 'app_resource'
    answers.live = { active: true, sub: '7', permissions: ['vouchers:read'] }
    const token = payload({ jti: 'jti-1', permissions: ['shop:order'] })
    expect(await resolveOAuthResourcePermissions('live', token, [])).toEqual(['vouchers:read'])
    expect(await resolveOAuthResourcePermissions('live', token, [])).toEqual(['vouchers:read'])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://frigear.example.test/oauth/introspect')
    expect(calls[0]!.authorization).toBe(`Basic ${btoa('app_resource:secret')}`)
  })

  it('refuses inactive tokens, another subject\'s answer and an unreachable issuer (fail closed)', async () => {
    introspection.clientId = 'app_resource'
    answers.other = { active: true, sub: '8', permissions: ['vouchers:read'] }
    expect(await resolveOAuthResourcePermissions('gone', payload({ jti: 'jti-2' }), [])).toBeNull()
    expect(await resolveOAuthResourcePermissions('other', payload({ jti: 'jti-3' }), [])).toBeNull()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await resolveOAuthResourcePermissions('down', payload({ jti: 'jti-4' }), [])).toBeNull()
    error.mockRestore()
  })
})
