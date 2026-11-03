import { describe, expect, it, vi } from 'vitest'
import { OAuthTransientError } from '../../src/runtime/core'
import { createAuthorizedApi } from '../../src/runtime/utils/api'
import type { ApiRequestOptions } from '../../src/runtime/utils/api'

const unauthorized = () => Object.assign(new Error('401'), { statusCode: 401 })

function setup(options: { refresh?: () => Promise<string | null>, rejects?: (token: string | null) => boolean } = {}) {
  const sent: { url: string, baseURL?: string, authorization: string | null }[] = []
  const onUnauthorized = vi.fn()
  const client = {
    getAccessToken: vi.fn(async ({ forceRefresh }: { forceRefresh?: boolean } = {}) => forceRefresh ? (options.refresh ?? (async () => 'access-2'))() : 'access-1'),
  }
  const api = createAuthorizedApi({
    client,
    baseURL: 'https://api.test/v1',
    attachTo: ['https://api.test', 'https://id.test'],
    onUnauthorized,
    request: async <T>(url: string, opts: ApiRequestOptions) => {
      const authorization = new Headers(opts.headers).get('authorization')
      sent.push({ url, baseURL: opts.baseURL, authorization })
      if ((options.rejects ?? (token => token === 'Bearer access-1'))(authorization)) throw unauthorized()
      return { ok: true } as T
    },
  })
  return { api, sent, client, onUnauthorized }
}

describe('$api', () => {
  it('attaches the token to relative requests against the base URL, and to allowed absolute URLs', async () => {
    const { api, sent } = setup({ rejects: () => false })
    await api('/me')
    await api('https://id.test/oauth/userinfo')
    expect(sent.map(call => call.authorization)).toEqual(['Bearer access-1', 'Bearer access-1'])
    expect(sent[0]!.baseURL).toBe('https://api.test/v1')
  })

  it('sends no token elsewhere, also when a call overrides the base URL', async () => {
    const { api, sent } = setup({ rejects: () => false })
    await api('https://evil.test/collect')
    await api('/collect', { baseURL: 'https://evil.test' })
    expect(sent.map(call => call.authorization)).toEqual([null, null])
    expect(sent[1]!.baseURL).toBe('https://evil.test')
  })

  it('refreshes once on 401 and retries', async () => {
    const { api, sent, client, onUnauthorized } = setup()
    expect(await api('/me')).toEqual({ ok: true })
    expect(sent.map(call => call.authorization)).toEqual(['Bearer access-1', 'Bearer access-2'])
    expect(client.getAccessToken).toHaveBeenLastCalledWith({ forceRefresh: true, ifCurrent: 'access-1' })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('keeps the session when the refresh fails transiently', async () => {
    const { api, onUnauthorized } = setup({
      refresh: async () => {
        throw new OAuthTransientError('network_error', 'offline')
      },
    })
    await expect(api('/me')).rejects.toBeInstanceOf(OAuthTransientError)
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('ends the session when the refresh says it is over, or the retry is refused too', async () => {
    const ended = setup({ refresh: async () => null })
    await expect(ended.api('/me')).rejects.toMatchObject({ statusCode: 401 })
    expect(ended.onUnauthorized).toHaveBeenCalledOnce()

    const refused = setup({ rejects: () => true })
    await expect(refused.api('/me')).rejects.toMatchObject({ statusCode: 401 })
    expect(refused.onUnauthorized).toHaveBeenCalledOnce()
  })
})
