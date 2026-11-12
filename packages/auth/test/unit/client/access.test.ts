import { describe, expect, it, vi } from 'vitest'
import { accessFromAccessToken, loadIssuerAccess } from '../../../src/runtime/client/utils/access'
import type { IssuerAccessRequest } from '../../../src/runtime/client/utils/access'
import { authApi } from '../../../src/runtime/utils/api'
import { jwt } from './helpers'

const token = jwt({ sub: 'u1', scope: 'openid events:read', permissions: ['events:read', 'tickets:read', 'events:read', 3] })
const httpError = (statusCode: number) => Object.assign(new Error(String(statusCode)), { statusCode })

function setup(answer: () => Promise<unknown>, accessToken: string | null = token) {
  const sent: { url: string, baseURL: string, authorization?: string }[] = []
  const request = (async (url, options) => {
    sent.push({ url, baseURL: options.baseURL, authorization: options.headers.authorization })
    return answer()
  }) as IssuerAccessRequest
  const client = { getAccessToken: vi.fn(async () => accessToken) }
  return { sent, load: () => loadIssuerAccess({ client, request, issuer: 'https://id.example.test' }) }
}

describe('accessFromAccessToken', () => {
  it('reads the permissions and scope claims, unverified', () => {
    expect(accessFromAccessToken(token)).toEqual({ kind: 'oauth', scopes: ['openid', 'events:read'], permissions: ['events:read', 'tickets:read'] })
  })

  it('holds nothing for a token without the claim or an opaque token, and is null without a token', () => {
    expect(accessFromAccessToken(jwt({ sub: 'u1' }))).toEqual({ kind: 'oauth', scopes: [], permissions: [] })
    expect(accessFromAccessToken('opaque-token')).toEqual({ kind: 'oauth', scopes: [], permissions: [] })
    expect(accessFromAccessToken(null)).toBeNull()
  })
})

describe('loadIssuerAccess', () => {
  it('asks the issuer\'s /me/access with the bearer token', async () => {
    const live = { kind: 'oauth', scopes: ['events:read'], permissions: ['events:read'], roles: ['user'] }
    const { sent, load } = setup(async () => live)
    await expect(load()).resolves.toEqual(live)
    expect(sent).toEqual([{ url: authApi.me.access, baseURL: 'https://id.example.test', authorization: `Bearer ${token}` }])
  })

  it.each([
    ['a 404 (an issuer without the endpoint)', () => Promise.reject(httpError(404))],
    ['a network failure', () => Promise.reject(new TypeError('fetch failed'))],
    ['an answer that is not access', async () => '<html></html>'],
  ])('falls back to the token\'s permissions claim on %s', async (_, answer) => {
    const { load } = setup(answer)
    await expect(load()).resolves.toEqual({ kind: 'oauth', scopes: ['openid', 'events:read'], permissions: ['events:read', 'tickets:read'] })
  })

  it('is null without an access token, without asking', async () => {
    const { sent, load } = setup(async () => ({ permissions: [] }), null)
    await expect(load()).resolves.toBeNull()
    expect(sent).toEqual([])
  })
})
