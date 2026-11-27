import { describe, expect, it, vi } from 'vitest'
import { withRoutedApi } from '../../../src/runtime/client/utils/api'

const PAGE = 'capacitor://localhost/dashboard'
const API = 'https://frigear.example.test'

function setup(options: { apiBase?: string, page?: string, status?: (authorization: string | null, call: number) => number, refresh?: () => Promise<string | null> } = {}) {
  const sent: { url: string, authorization: string | null, method?: string, body?: unknown }[] = []
  const base = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const authorization = new Headers(init?.headers).get('authorization')
    sent.push({ url, authorization, method: init?.method, body: init?.body })
    return new Response('{}', { status: options.status?.(authorization, sent.length) ?? 200 })
  }) as unknown as typeof fetch
  const client = {
    getAccessToken: vi.fn(async ({ forceRefresh }: { forceRefresh?: boolean } = {}) => forceRefresh ? (options.refresh ?? (async () => 'access-2'))() : 'access-1'),
  }
  const onUnauthorized = vi.fn()
  const fetch = withRoutedApi(base, {
    page: options.page ?? PAGE,
    apiBase: options.apiBase ?? API,
    client,
    attachTo: [API],
    onUnauthorized,
  })
  return { fetch, base, sent, client, onUnauthorized }
}

describe('withRoutedApi', () => {
  it('sends the app\'s own /api/ requests to the API with the token, keeping method, body and query', async () => {
    const { fetch, sent } = setup()
    await fetch('/api/help-center/categories?locale=da')
    await fetch('capacitor://localhost/api/crew/me', { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } })
    await fetch(new URL('/api/shifts/me', PAGE))
    expect(sent).toEqual([
      { url: `${API}/api/help-center/categories?locale=da`, authorization: 'Bearer access-1', method: undefined, body: undefined },
      { url: `${API}/api/crew/me`, authorization: 'Bearer access-1', method: 'POST', body: '{"a":1}' },
      { url: `${API}/api/shifts/me`, authorization: 'Bearer access-1', method: undefined, body: undefined },
    ])
  })

  it('joins onto an API base with a path', async () => {
    const { fetch, sent } = setup({ apiBase: `${API}/v1/` })
    await fetch('/api/users/me')
    expect(sent[0]!.url).toBe(`${API}/v1/api/users/me`)
  })

  it('leaves everything else alone: other paths, other hosts and Request objects', async () => {
    const { fetch, sent, client } = setup()
    await fetch('/_nuxt/entry.js')
    await fetch('/apikeys')
    await fetch('https://tiles.example.test/api/1/2/3.png')
    await fetch(new Request('https://localhost/api/x'))
    expect(sent.map(call => [call.url, call.authorization])).toEqual([
      ['/_nuxt/entry.js', null],
      ['/apikeys', null],
      ['https://tiles.example.test/api/1/2/3.png', null],
      ['https://localhost/api/x', null],
    ])
    expect(client.getAccessToken).not.toHaveBeenCalled()
  })

  it('is plain fetch when the API is the page\'s own host (or not a URL)', async () => {
    const { fetch, base } = setup({ page: `${API}/dashboard` })
    expect(fetch).toBe(base)
    const empty = setup({ apiBase: '' })
    expect(empty.fetch).toBe(empty.base)
  })

  it('routes a request with its own authorization header without the token', async () => {
    const { fetch, sent, client } = setup()
    await fetch('/api/forms/contact', { headers: { authorization: 'Bearer form-token' } })
    expect(sent).toEqual([{ url: `${API}/api/forms/contact`, authorization: 'Bearer form-token', method: undefined, body: undefined }])
    expect(client.getAccessToken).not.toHaveBeenCalled()
  })

  it('refreshes once on a 401 and retries with the new token', async () => {
    const { fetch, sent, onUnauthorized } = setup({ status: authorization => authorization === 'Bearer access-1' ? 401 : 200 })
    const response = await fetch('/api/crew/me')
    expect(response.status).toBe(200)
    expect(sent.map(call => call.authorization)).toEqual(['Bearer access-1', 'Bearer access-2'])
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('answers the 401 as it came once the session is over', async () => {
    const { fetch, onUnauthorized } = setup({ status: () => 401, refresh: async () => null })
    const response = await fetch('/api/crew/me')
    expect(response.status).toBe(401)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })
})
