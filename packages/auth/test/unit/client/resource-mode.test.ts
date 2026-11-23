import { describe, expect, it, vi } from 'vitest'
import { resolveApiTargets } from '../../../src/runtime/client/utils'
import { withSameOriginToken } from '../../../src/runtime/client/utils/api'
import { loadIssuerAccess } from '../../../src/runtime/client/utils/access'
import type { IssuerAccessRequest } from '../../../src/runtime/client/utils/access'
import { jwt } from './helpers'

const same = (url: string) => url
const ORIGIN = 'http://127.0.0.1:49152'

describe('resolveApiTargets', () => {
  const config = { issuer: 'https://id.example.test', apiBase: '', apiOrigins: [] as string[] }

  it('leaves client mode as it was: the issuer is the API', () => {
    expect(resolveApiTargets(config, same, ORIGIN)).toEqual({
      apiBase: 'https://id.example.test',
      ownOrigin: undefined,
      clientAttachTo: ['https://id.example.test', 'https://id.example.test'],
      apiAttachTo: ['https://id.example.test', 'https://id.example.test'],
    })
  })

  it('adds the app\'s own origin in resource mode, as `$api`\'s base unless `apiBase` is set', () => {
    const resource = { ...config, sameOrigin: true }
    expect(resolveApiTargets(resource, same, ORIGIN)).toEqual({
      apiBase: ORIGIN,
      ownOrigin: ORIGIN,
      clientAttachTo: ['https://id.example.test', 'https://id.example.test', ORIGIN],
      apiAttachTo: [ORIGIN, 'https://id.example.test'],
    })
    const withBase = resolveApiTargets({ ...resource, apiBase: 'https://api.example.test', apiOrigins: ['https://api.example.test'] }, same, ORIGIN)
    expect(withBase.apiBase).toBe('https://api.example.test')
    expect(withBase.apiAttachTo).toEqual(['https://api.example.test', ORIGIN])
    // Outside a browser there is no origin to add.
    expect(resolveApiTargets(resource, same, undefined).ownOrigin).toBeUndefined()
  })

  it('never rewrites the app\'s own origin (the loopback rewrite is for the issuer on a device)', () => {
    const rewrite = (url: string) => url.replace('localhost', '192.168.1.20')
    const targets = resolveApiTargets({ issuer: 'http://localhost:3000', apiBase: '', apiOrigins: [], sameOrigin: true }, rewrite, 'http://localhost:4000')
    expect(targets.apiAttachTo).toEqual(['http://localhost:4000', 'http://192.168.1.20:3000'])
  })
})

describe('withSameOriginToken', () => {
  function setup(token: string | null = 'tok') {
    const sent: { url: string, authorization: string | null }[] = []
    const base = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      sent.push({ url, authorization: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('authorization') })
      return new Response('{}')
    }) as unknown as typeof fetch
    const getAccessToken = vi.fn(async () => token)
    const fetch = withSameOriginToken(base, { origin: ORIGIN, getAccessToken, skip: url => url.origin === 'https://id.example.test' })
    return { fetch, sent, getAccessToken }
  }

  it('sends the token to the app\'s own origin only', async () => {
    const { fetch, sent } = setup()
    await fetch('/api/notes')
    await fetch(`${ORIGIN}/api/notes`, { headers: { accept: 'application/json' } })
    await fetch(new Request(`${ORIGIN}/api/notes`))
    await fetch('https://other.example.test/api')
    expect(sent.map(entry => entry.authorization)).toEqual(['Bearer tok', 'Bearer tok', 'Bearer tok', null])
  })

  it('leaves the issuer, an own authorization header and a signed-out app alone', async () => {
    const { fetch, sent, getAccessToken } = setup()
    await fetch('https://id.example.test/oauth/token', { method: 'POST' })
    await fetch('/api/notes', { headers: { authorization: 'Bearer mine' } })
    expect(sent.map(entry => entry.authorization)).toEqual([null, 'Bearer mine'])
    expect(getAccessToken).not.toHaveBeenCalled()

    const signedOut = setup(null)
    await signedOut.fetch('/api/notes')
    expect(signedOut.sent[0]!.authorization).toBeNull()
  })

  it('sends the request signed out when the token cannot be read', async () => {
    const { fetch, sent, getAccessToken } = setup()
    getAccessToken.mockRejectedValueOnce(new Error('offline'))
    await fetch('/api/notes')
    expect(sent[0]!.authorization).toBeNull()
  })
})

describe('loadIssuerAccess in resource mode', () => {
  it('asks the app\'s own server and never falls back to the issuer\'s permissions claim', async () => {
    const token = jwt({ sub: 'u1', scope: 'openid', permissions: ['issuer:only'] })
    const request = (async () => {
      throw Object.assign(new Error('503'), { statusCode: 503 })
    }) as IssuerAccessRequest
    const client = { getAccessToken: async () => token }
    await expect(loadIssuerAccess({ client, request, issuer: ORIGIN, claimFallback: false })).resolves.toBeNull()
    // Client mode keeps its fallback.
    await expect(loadIssuerAccess({ client, request, issuer: 'https://id.example.test' })).resolves.toMatchObject({ permissions: ['issuer:only'] })
  })
})
