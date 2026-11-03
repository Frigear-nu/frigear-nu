import { describe, expect, it } from 'vitest'
import {
  OAuthAuthorizationError,
  OAuthConfigError,
  OAuthError,
  OAuthTransientError,
  challengeFor,
  createMemoryLock,
  createOAuthClient,
  memoryStorage,
} from '../../src/runtime/core'
import type { OAuthChangeEvent } from '../../src/runtime/core'
import { ISSUER, REDIRECT, json, jwt, metadata, setup, signIn, tokens } from './helpers'

const PENDING = 'oauth:app_1:pending'
const TOKENS = 'oauth:app_1:tokens'

/** A response that only arrives once released. */
function deferred() {
  let release!: () => void
  const ready = new Promise<void>(resolve => (release = resolve))
  return { ready, release }
}

describe('startAuthorization', () => {
  it('builds an S256 PKCE authorize URL from the discovered endpoint and stores the verifier', async () => {
    const { client, storage } = setup(() => tokens(1))
    const { url } = await client.startAuthorization()
    const u = new URL(url)
    const p = u.searchParams

    expect(`${u.origin}${u.pathname}`).toBe(`${ISSUER}/oauth/authorize`)
    expect(Object.fromEntries([...p].filter(([k]) => !['state', 'code_challenge'].includes(k)))).toEqual({
      client_id: 'app_1',
      redirect_uri: REDIRECT,
      response_type: 'code',
      scope: 'bills:read',
      code_challenge_method: 'S256',
    })

    const pending = JSON.parse((await storage.get(PENDING))!)
    expect(pending.state).toBe(p.get('state'))
    expect(await challengeFor(pending.verifier)).toBe(p.get('code_challenge'))
    expect(pending.verifier.length).toBeGreaterThanOrEqual(43)
  })

  it('uses a fresh state and verifier every time', async () => {
    const { client } = setup(() => tokens(1))
    const a = new URL((await client.startAuthorization()).url).searchParams
    const b = new URL((await client.startAuthorization()).url).searchParams
    expect(a.get('state')).not.toBe(b.get('state'))
    expect(a.get('code_challenge')).not.toBe(b.get('code_challenge'))
  })

  it('sends a nonce for openid, and extra parameters that cannot replace the security ones', async () => {
    const { client, storage } = setup(() => tokens(1), {
      scope: ['openid', 'offline_access'],
      authorizationParams: { prompt: 'consent', state: 'forced', code_challenge_method: 'plain' },
    })
    const p = new URL((await client.startAuthorization({ params: { ui_locales: 'da' } })).url).searchParams
    expect(p.get('scope')).toBe('openid offline_access')
    expect(p.get('prompt')).toBe('consent')
    expect(p.get('ui_locales')).toBe('da')
    expect(p.get('code_challenge_method')).toBe('S256')
    expect(p.get('state')).not.toBe('forced')
    expect(p.get('nonce')).toBe(JSON.parse((await storage.get(PENDING))!).nonce)
  })
})

describe('handleCallback', () => {
  it('exchanges the code with the verifier, without a secret, and stores the tokens', async () => {
    const ctx = setup(() => tokens(1))
    const { tokens: result, returnTo } = await signIn(ctx, { returnTo: '/bills' })

    expect(result.accessToken).toBe('access-1')
    expect(returnTo).toBe('/bills')
    const [exchange] = ctx.requests()
    expect(exchange!.url).toBe(`${ISSUER}/oauth/token`)
    const body = Object.fromEntries(exchange!.body)
    expect(body).toMatchObject({ grant_type: 'authorization_code', code: 'abc', redirect_uri: REDIRECT, client_id: 'app_1' })
    expect(body.code_verifier).toBeTruthy()
    expect(body.client_secret).toBeUndefined()
    expect(await ctx.client.isAuthenticated()).toBe(true)
  })

  it('sends the client secret only when configured (dev confidential client)', async () => {
    const ctx = setup(() => tokens(1), { clientSecret: 'dev-secret' })
    await signIn(ctx)
    expect(ctx.requests()[0]!.body.get('client_secret')).toBe('dev-secret')
  })

  it('rejects a state mismatch and burns the pending authorization', async () => {
    const ctx = setup(() => tokens(1))
    await ctx.client.startAuthorization()
    await expect(ctx.client.handleCallback(`${REDIRECT}?code=abc&state=forged`)).rejects.toMatchObject({ code: 'invalid_state' })
    expect(ctx.requests()).toHaveLength(0)
    await expect(ctx.client.handleCallback(`${REDIRECT}?code=abc&state=forged`)).rejects.toMatchObject({ code: 'no_pending_authorization' })
  })

  it('surfaces an authorization error from the server', async () => {
    const ctx = setup(() => tokens(1))
    const { state } = await ctx.client.startAuthorization()
    await expect(ctx.client.handleCallback(`${REDIRECT}?error=access_denied&state=${state}`)).rejects.toMatchObject({ code: 'access_denied', kind: 'authorization' })
  })

  it('surfaces a failed token exchange as a failed sign-in', async () => {
    const ctx = setup(() => json({ error: 'invalid_grant', error_description: 'bad code' }, 400))
    const error = await signIn(ctx).catch(e => e)
    expect(error).toBeInstanceOf(OAuthAuthorizationError)
    expect(error).toMatchObject({ code: 'invalid_grant', status: 400 })
    expect(await ctx.client.isAuthenticated()).toBe(false)
  })

  it('does not accept a callback without a code', async () => {
    const ctx = setup(() => tokens(1))
    const { state } = await ctx.client.startAuthorization()
    await expect(ctx.client.handleCallback(`${REDIRECT}?state=${state}`)).rejects.toBeInstanceOf(OAuthError)
  })

  it('rejects a response naming another issuer (RFC 9207)', async () => {
    const ctx = setup(() => tokens(1))
    const { state } = await ctx.client.startAuthorization()
    await expect(ctx.client.handleCallback(`${REDIRECT}?code=abc&state=${state}&iss=${encodeURIComponent('https://evil.test')}`))
      .rejects.toMatchObject({ code: 'issuer_mismatch' })
  })

  it('rejects a sign-in that took longer than the pending TTL', async () => {
    const ctx = setup(() => tokens(1), { pendingTtlSeconds: 60 })
    const { state } = await ctx.client.startAuthorization()
    ctx.advance(61_000)
    await expect(ctx.client.handleCallback(`${REDIRECT}?code=abc&state=${state}`)).rejects.toMatchObject({ code: 'expired_authorization' })
  })
})

describe('id_token', () => {
  const withIdToken = (claims: (nonce: string) => Record<string, unknown>) => {
    let nonce = ''
    const ctx = setup(() => tokens(1, { id_token: jwt(claims(nonce)) }), { scope: 'openid' })
    return {
      ctx,
      async run() {
        const { url } = await ctx.client.startAuthorization()
        const params = new URL(url).searchParams
        nonce = params.get('nonce')!
        return ctx.client.handleCallback(`${REDIRECT}?code=abc&state=${params.get('state')}`)
      },
    }
  }
  const valid = (nonce: string, now: number) => ({ iss: ISSUER, aud: 'app_1', sub: '42', exp: now / 1000 + 300, iat: now / 1000, nonce, name: 'Ada' })

  it('accepts a valid id_token and exposes its claims', async () => {
    const { ctx, run } = withIdToken(nonce => valid(nonce, 1_000_000_000_000))
    await run()
    expect(await ctx.client.getClaims()).toMatchObject({ sub: '42', name: 'Ada' })
  })

  it.each([
    ['another issuer', (claims: Record<string, unknown>) => ({ ...claims, iss: 'https://evil.test' })],
    ['another audience', (claims: Record<string, unknown>) => ({ ...claims, aud: 'other-app' })],
    ['another authorized party', (claims: Record<string, unknown>) => ({ ...claims, aud: ['app_1', 'api'], azp: 'other-app' })],
    ['an expired token', (claims: Record<string, unknown>) => ({ ...claims, exp: 1_000_000_000 - 3600 })],
    ['a replayed nonce', (claims: Record<string, unknown>) => ({ ...claims, nonce: 'old' })],
  ])('rejects %s', async (_name, change) => {
    const { ctx, run } = withIdToken(nonce => change(valid(nonce, 1_000_000_000_000)))
    await expect(run()).rejects.toMatchObject({ code: 'invalid_id_token' })
    expect(await ctx.client.isAuthenticated()).toBe(false)
  })
})

describe('getAccessToken', () => {
  it('returns null when signed out', async () => {
    expect(await setup(() => tokens(1)).client.getAccessToken()).toBeNull()
  })

  it('returns the stored token while it is fresh, without any request', async () => {
    const ctx = setup(() => tokens(1))
    await signIn(ctx)
    ctx.advance(60_000)
    expect(await ctx.client.getAccessToken()).toBe('access-1')
    expect(ctx.requests()).toHaveLength(1)
  })

  it('refreshes near expiry and shares one request between 10 concurrent callers', async () => {
    let n = 1
    const ctx = setup(({ body }) => (body.get('grant_type') === 'refresh_token' ? tokens(++n) : tokens(1)))
    await signIn(ctx)
    ctx.advance(3600 * 1000 - 10_000)

    const results = await Promise.all(Array.from({ length: 10 }, () => ctx.client.getAccessToken()))
    expect(results).toEqual(Array.from({ length: 10 }, () => 'access-2'))
    expect(ctx.grants('refresh_token')).toHaveLength(1)
    expect(ctx.grants('refresh_token')[0]!.body.get('refresh_token')).toBe('refresh-1')
  })

  it('keeps the refresh token when the server does not rotate it', async () => {
    const ctx = setup(({ body }) => body.get('grant_type') === 'refresh_token'
      ? json({ access_token: 'access-2', token_type: 'Bearer', expires_in: 3600 })
      : tokens(1))
    await signIn(ctx)
    ctx.advance(3600 * 1000)
    expect(await ctx.client.getAccessToken()).toBe('access-2')
    expect((await ctx.client.getTokens())!.refreshToken).toBe('refresh-1')
    ctx.advance(3600 * 1000)
    await ctx.client.getAccessToken()
    expect(ctx.grants('refresh_token').map(call => call.body.get('refresh_token'))).toEqual(['refresh-1', 'refresh-1'])
  })

  it('signs out when the refresh token is rejected (invalid_grant)', async () => {
    const ctx = setup(({ body }) => (body.get('grant_type') === 'refresh_token' ? json({ error: 'invalid_grant' }, 400) : tokens(1)))
    const events: OAuthChangeEvent[] = []
    ctx.client.onChange(event => events.push(event))
    await signIn(ctx)
    ctx.advance(3600 * 1000)
    expect(await ctx.client.getAccessToken()).toBeNull()
    expect(await ctx.client.isAuthenticated()).toBe(false)
    expect(events.map(event => event.type)).toEqual(['signed-in', 'signed-out'])
    expect(events[1]).toMatchObject({ reason: 'invalid_grant' })
  })

  it.each([
    ['a server error', () => json({}, 503)],
    ['a rate limit', () => json({ error: 'slow_down' }, 429)],
    ['a network failure', () => {
      throw new TypeError('fetch failed')
    }],
  ])('keeps the session on %s', async (_name, failure) => {
    let fail = true
    const ctx = setup(({ body }) => (body.get('grant_type') === 'refresh_token' ? (fail ? failure() : tokens(2)) : tokens(1)))
    const events: string[] = []
    ctx.client.onChange(event => events.push(event.type))
    await signIn(ctx)
    ctx.advance(3600 * 1000)
    await expect(ctx.client.getAccessToken()).rejects.toBeInstanceOf(OAuthTransientError)
    expect(await ctx.client.isAuthenticated()).toBe(true)
    expect(events).toContain('refresh-failed')
    fail = false
    expect(await ctx.client.getAccessToken()).toBe('access-2')
  })

  it('reports a misconfigured client (invalid_client) without signing out', async () => {
    const ctx = setup(({ body }) => (body.get('grant_type') === 'refresh_token' ? json({ error: 'invalid_client' }, 401) : tokens(1)))
    await signIn(ctx)
    ctx.advance(3600 * 1000)
    await expect(ctx.client.getAccessToken()).rejects.toBeInstanceOf(OAuthConfigError)
    expect(await ctx.client.isAuthenticated()).toBe(true)
  })

  it('forces a refresh, but not when another caller already replaced the rejected token (ifCurrent)', async () => {
    let n = 1
    const ctx = setup(({ body }) => (body.get('grant_type') === 'refresh_token' ? tokens(++n) : tokens(1)))
    await signIn(ctx)

    expect(await ctx.client.getAccessToken({ forceRefresh: true, ifCurrent: 'access-1' })).toBe('access-2')
    expect(ctx.grants('refresh_token')).toHaveLength(1)
    // A second request that saw access-1 rejected gets access-2 without another refresh.
    expect(await ctx.client.getAccessToken({ forceRefresh: true, ifCurrent: 'access-1' })).toBe('access-2')
    expect(ctx.grants('refresh_token')).toHaveLength(1)
  })

  it('re-reads the storage under the lock, so a tab never reuses a refresh token another tab rotated', async () => {
    // Two tabs: one storage (localStorage), one lock (Web Locks), separate clients.
    const storage = memoryStorage()
    const lock = createMemoryLock()
    const gate = deferred()
    let n = 1
    const server = async ({ body }: { body: URLSearchParams }) => {
      if (body.get('grant_type') !== 'refresh_token') return tokens(1)
      await gate.ready
      return tokens(++n)
    }
    const a = setup(server, { storage, lock })
    const b = setup(server, { storage, lock })
    await signIn(a)
    a.advance(3600 * 1000)
    b.clock.now = a.clock.now

    const first = a.client.getAccessToken()
    // Let tab A take the lock and send its refresh; tab B then reads the (still expired) tokens and waits.
    await new Promise(resolve => setTimeout(resolve, 0))
    const second = b.client.getAccessToken()
    gate.release()

    expect(await first).toBe('access-2')
    expect(await second).toBe('access-2')
    expect([...a.grants('refresh_token'), ...b.grants('refresh_token')]).toHaveLength(1)
  })
})

describe('discovery', () => {
  it('discovers once and caches the endpoints', async () => {
    const ctx = setup(() => tokens(1))
    await signIn(ctx)
    await ctx.client.startAuthorization()
    expect(ctx.calls.filter(call => call.url.includes('/.well-known/'))).toHaveLength(1)
  })

  it('falls back to RFC 8414 metadata', async () => {
    const ctx = setup(() => tokens(1), {
      metadataHandler: ({ url }) => url.endsWith('/.well-known/oauth-authorization-server')
        ? json(metadata({ token_endpoint: `${ISSUER}/token` }))
        : json({}, 404),
    })
    await signIn(ctx)
    expect(ctx.requests()[0]!.url).toBe(`${ISSUER}/token`)
  })

  it('rejects metadata of another issuer (mix-up)', async () => {
    const ctx = setup(() => tokens(1), { metadataHandler: () => json(metadata({ issuer: 'https://evil.test' })) })
    await expect(ctx.client.startAuthorization()).rejects.toMatchObject({ code: 'issuer_mismatch', kind: 'config' })
  })

  it('rejects a server without S256 PKCE', async () => {
    const ctx = setup(() => tokens(1), { metadataHandler: () => json(metadata({ code_challenge_methods_supported: ['plain'] })) })
    await expect(ctx.client.startAuthorization()).rejects.toMatchObject({ code: 'pkce_unsupported' })
  })

  it('retries a discovery that failed transiently', async () => {
    let down = true
    const ctx = setup(() => tokens(1), { metadataHandler: () => (down ? json({}, 502) : json(metadata())) })
    await expect(ctx.client.startAuthorization()).rejects.toBeInstanceOf(OAuthTransientError)
    down = false
    await expect(ctx.client.startAuthorization()).resolves.toBeDefined()
  })

  it('uses the oauth-server paths without discovery, with configured endpoints winning', async () => {
    const ctx = setup(() => tokens(1), { discovery: false, endpoints: { token: '/custom/token' } })
    const { url } = await ctx.client.startAuthorization()
    expect(url.startsWith(`${ISSUER}/oauth/authorize?`)).toBe(true)
    const state = new URL(url).searchParams.get('state')
    await ctx.client.handleCallback(`${REDIRECT}?code=abc&state=${state}`)
    expect(ctx.calls.map(call => call.url)).toEqual([`${ISSUER}/custom/token`])
  })

  it('rewrites the URLs it requests but validates the configured issuer', async () => {
    const issuer = 'http://localhost:3000'
    const seen: string[] = []
    const client = createOAuthClient({
      issuer,
      clientId: 'app_1',
      redirectUri: 'app:/auth/callback',
      rewriteUrl: url => url.replace('localhost', '192.168.1.20'),
      fetch: async (input) => {
        seen.push(String(input))
        return json({ issuer, authorization_endpoint: `${issuer}/oauth/authorize`, token_endpoint: `${issuer}/oauth/token` })
      },
    })
    const { url } = await client.startAuthorization()
    expect(seen).toEqual(['http://192.168.1.20:3000/.well-known/openid-configuration'])
    expect(url.startsWith('http://192.168.1.20:3000/oauth/authorize?')).toBe(true)
  })
})

describe('isCallbackUrl', () => {
  it('matches the redirect URI with an authorization response only', () => {
    const { client } = setup(() => tokens(1), { redirectUri: 'nu.frigear.app:/auth/callback' })
    expect(client.isCallbackUrl('nu.frigear.app:/auth/callback?code=1&state=2')).toBe(true)
    expect(client.isCallbackUrl('NU.FRIGEAR.APP:/auth/callback?error=access_denied&state=2')).toBe(true)
    expect(client.isCallbackUrl('nu.frigear.app:/auth/callback')).toBe(false)
    expect(client.isCallbackUrl('nu.frigear.app:/events/1?code=1&state=2')).toBe(false)
    expect(client.isCallbackUrl('https://frigear.nu/auth/callback?code=1&state=2')).toBe(false)
    expect(client.isCallbackUrl('not a url')).toBe(false)
  })
})

describe('fetch', () => {
  it('sends the bearer token, and refreshes and retries once on 401', async () => {
    let n = 1
    const api: string[] = []
    const ctx = setup(({ url, body, headers }) => {
      if (url.startsWith('https://api.test')) {
        api.push(headers.get('authorization')!)
        return new Response(null, { status: headers.get('authorization') === 'Bearer access-1' ? 401 : 200 })
      }
      return body.get('grant_type') === 'refresh_token' ? tokens(++n) : tokens(1)
    })
    await signIn(ctx)
    const response = await ctx.client.fetch('https://api.test/me')
    expect(response.status).toBe(200)
    expect(api).toEqual(['Bearer access-1', 'Bearer access-2'])
  })
})

describe('logout', () => {
  it('revokes the refresh token and clears local state', async () => {
    const ctx = setup(() => tokens(1))
    await signIn(ctx)
    await ctx.client.logout()

    const revoke = ctx.calls.find(c => c.url === `${ISSUER}/oauth/revoke`)!
    expect(revoke.body.get('token')).toBe('refresh-1')
    expect(revoke.body.get('token_type_hint')).toBe('refresh_token')
    expect(await ctx.client.isAuthenticated()).toBe(false)
    expect(await ctx.storage.get(TOKENS)).toBeNull()
  })

  it('still signs out locally when the revoke request fails', async () => {
    const ctx = setup(({ url }) => {
      if (url.endsWith('/revoke')) throw new Error('offline')
      return tokens(1)
    })
    await signIn(ctx)
    await ctx.client.logout()
    expect(await ctx.client.isAuthenticated()).toBe(false)
  })
})
