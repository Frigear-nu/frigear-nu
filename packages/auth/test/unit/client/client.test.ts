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
} from '../../../src/runtime/client/core'
import type { OAuthChangeEvent, TokenStorage } from '../../../src/runtime/client/core'
import { validateIdToken } from '../../../src/runtime/client/core/jwt'
import { ISSUER, REDIRECT, json, jwt, metadata, setup, signIn, tokens } from './helpers'

const PENDING = 'oauth:app_1:pending'
const TOKENS = 'oauth:app_1:tokens'

/** The stored pending authorization of `state`. */
const pendingOf = async (storage: TokenStorage, state: string | null) => JSON.parse((await storage.get(PENDING))!)[state!]

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

    const pending = await pendingOf(storage, p.get('state'))
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
    expect(p.get('nonce')).toBe((await pendingOf(storage, p.get('state'))).nonce)
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

  it('rejects a forged state without cancelling the sign-in in progress', async () => {
    const ctx = setup(() => tokens(1))
    const { state } = await ctx.client.startAuthorization()
    await expect(ctx.client.handleCallback(`${REDIRECT}?code=abc&state=forged`)).rejects.toMatchObject({ code: 'invalid_state' })
    expect(await ctx.client.matchesPendingAuthorization(`${REDIRECT}?code=abc&state=forged`)).toBe(false)
    expect(ctx.requests()).toHaveLength(0)

    expect(await ctx.client.matchesPendingAuthorization(`${REDIRECT}?code=abc&state=${state}`)).toBe(true)
    await ctx.client.handleCallback(`${REDIRECT}?code=abc&state=${state}`)
    expect(await ctx.client.isAuthenticated()).toBe(true)
    // Single use: the same callback again is refused.
    await expect(ctx.client.handleCallback(`${REDIRECT}?code=abc&state=${state}`)).rejects.toMatchObject({ code: 'no_pending_authorization' })
  })

  it('keeps sign-ins started in two tabs apart (pending authorizations by state)', async () => {
    const ctx = setup(() => tokens(1))
    const first = await ctx.client.startAuthorization({ returnTo: '/a' })
    const second = await ctx.client.startAuthorization({ returnTo: '/b' })
    const result = await ctx.client.handleCallback(`${REDIRECT}?code=abc&state=${first.state}`)
    expect(result.returnTo).toBe('/a')
    expect(await ctx.client.matchesPendingAuthorization(`${REDIRECT}?code=x&state=${second.state}`)).toBe(true)
  })

  it('requires iss when the server says it always sends it (RFC 9207)', async () => {
    const ctx = setup(() => tokens(1), { metadataHandler: () => json(metadata({ authorization_response_iss_parameter_supported: true })) })
    const { state } = await ctx.client.startAuthorization()
    await expect(ctx.client.handleCallback(`${REDIRECT}?code=abc&state=${state}`)).rejects.toMatchObject({ code: 'issuer_missing' })
    const again = await ctx.client.startAuthorization()
    await ctx.client.handleCallback(`${REDIRECT}?code=abc&state=${again.state}&iss=${encodeURIComponent(ISSUER)}`)
    expect(await ctx.client.isAuthenticated()).toBe(true)
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
    ['a replayed nonce', (claims: Record<string, unknown>) => ({ ...claims, nonce: 'old' })],
  ])('rejects %s', async (_name, change) => {
    const { ctx, run } = withIdToken(nonce => change(valid(nonce, 1_000_000_000_000)))
    await expect(run()).rejects.toMatchObject({ code: 'invalid_id_token' })
    expect(await ctx.client.isAuthenticated()).toBe(false)
  })

  it('does not fail a sign-in on a device clock that is off by hours', async () => {
    // Issued two hours "before" the device's clock: expired by the device's reckoning, fine by the issuer's.
    const { ctx, run } = withIdToken(nonce => valid(nonce, 1_000_000_000_000 - 7_200_000))
    await run()
    expect(await ctx.client.isAuthenticated()).toBe(true)
  })

  describe('with requireIdToken (client mode)', () => {
    it('fails a sign-in without an id_token, stores nothing and revokes the refresh token', async () => {
      const ctx = setup(({ url }) => url.endsWith('/oauth/revoke') ? new Response(null, { status: 200 }) : tokens(1), { requireIdToken: true })
      const events: OAuthChangeEvent[] = []
      ctx.client.onChange(event => void events.push(event))
      await expect(signIn(ctx)).rejects.toMatchObject({ code: 'missing_id_token' })
      expect(await ctx.client.getTokens()).toBeNull()
      expect(events).toEqual([])
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(ctx.requests().find(call => call.url.endsWith('/oauth/revoke'))?.body.get('token')).toBe('refresh-1')
    })

    it('signs in with a valid id_token', async () => {
      let nonce = ''
      const ctx = setup(() => tokens(1, { id_token: jwt(valid(nonce, 1_000_000_000_000)) }), { scope: 'openid', requireIdToken: true })
      const { url } = await ctx.client.startAuthorization()
      nonce = new URL(url).searchParams.get('nonce')!
      await ctx.client.handleCallback(`${REDIRECT}?code=abc&state=${new URL(url).searchParams.get('state')}`)
      expect(await ctx.client.getClaims()).toMatchObject({ sub: '42' })
    })
  })

  it('gives a sign-in a session id that refreshes keep', async () => {
    let n = 1
    const ctx = setup(({ body }) => tokens(body.get('grant_type') === 'refresh_token' ? ++n : 1))
    await signIn(ctx)
    const { sessionId } = (await ctx.client.getTokens())!
    expect(sessionId).toMatch(/^[\w-]{16,}$/)
    ctx.advance(3600 * 1000)
    expect(await ctx.client.getAccessToken()).toBe('access-2')
    expect((await ctx.client.getTokens())!.sessionId).toBe(sessionId)
    await ctx.client.logout()
    await signIn(ctx)
    expect((await ctx.client.getTokens())!.sessionId).not.toBe(sessionId)
  })

  it('still offers an expiry check for tokens from elsewhere', () => {
    const token = jwt({ iss: ISSUER, aud: 'app_1', sub: '1', exp: 1000 })
    expect(() => validateIdToken(token, { issuer: ISSUER, clientId: 'app_1', now: 2_000_000 })).toThrow(/expired/)
    expect(validateIdToken(token, { issuer: ISSUER, clientId: 'app_1' }).sub).toBe('1')
  })

  describe('on refresh', () => {
    const idToken = (claims: Record<string, unknown>) => jwt({ iss: ISSUER, aud: 'app_1', sub: '42', exp: 2_000_000_000, ...claims })
    const refreshing = (refreshed: Record<string, unknown>) => {
      const warnings: string[] = []
      let n = 1
      const ctx = setup(({ body }) => body.get('grant_type') === 'refresh_token'
        ? tokens(++n, { id_token: idToken(refreshed) })
        : tokens(1, { id_token: idToken({ name: 'Ada' }) }), { onWarning: message => void warnings.push(message) })
      return { ctx, warnings }
    }

    it('takes the claims of a valid refreshed id_token', async () => {
      const { ctx, warnings } = refreshing({ name: 'Ada L.' })
      await signIn(ctx)
      ctx.advance(3600 * 1000)
      expect(await ctx.client.getAccessToken()).toBe('access-2')
      expect(await ctx.client.getClaims()).toMatchObject({ name: 'Ada L.' })
      expect(warnings).toEqual([])
    })

    it.each([
      ['another audience', { aud: 'other-app' }],
      ['another user', { sub: '43' }],
    ])('keeps the rotated tokens and the previous claims when the refreshed id_token names %s', async (_name, refreshed) => {
      const { ctx, warnings } = refreshing(refreshed)
      await signIn(ctx)
      ctx.advance(3600 * 1000)
      expect(await ctx.client.getAccessToken()).toBe('access-2')
      expect((await ctx.client.getTokens())!.refreshToken).toBe('refresh-2')
      expect(await ctx.client.getClaims()).toMatchObject({ sub: '42', name: 'Ada' })
      expect(warnings).toHaveLength(1)
      // The next refresh uses the rotated token, never the spent one.
      ctx.advance(3600 * 1000)
      await ctx.client.getAccessToken()
      expect(ctx.grants('refresh_token').map(call => call.body.get('refresh_token'))).toEqual(['refresh-1', 'refresh-2'])
    })
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

  it.each([
    ['a WAF\'s HTML 403', () => new Response('<html>Forbidden</html>', { status: 403, headers: { 'content-type': 'text/html' } }), OAuthTransientError],
    ['a proxy\'s 404', () => new Response('Not Found', { status: 404 }), OAuthTransientError],
    ['an unknown OAuth error', () => json({ error: 'something_new' }, 400), OAuthConfigError],
  ])('keeps the session on %s', async (_name, failure, kind) => {
    const ctx = setup(({ body }) => (body.get('grant_type') === 'refresh_token' ? failure() : tokens(1)))
    await signIn(ctx)
    ctx.advance(3600 * 1000)
    await expect(ctx.client.getAccessToken()).rejects.toBeInstanceOf(kind)
    expect(await ctx.client.isAuthenticated()).toBe(true)
  })

  it('times out a hanging token request and releases the lock', async () => {
    let hang = true
    const storage = memoryStorage()
    const client = createOAuthClient({
      issuer: ISSUER,
      clientId: 'app_1',
      redirectUri: REDIRECT,
      discovery: false,
      storage,
      requestTimeoutSeconds: 0.05,
      fetch: (_input, init) => hang
        ? new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)))
        : Promise.resolve(tokens(2)),
    })
    await storage.set(TOKENS, JSON.stringify({ accessToken: 'access-1', refreshToken: 'refresh-1', idToken: null, tokenType: 'Bearer', expiresAt: 0, scope: '' }))
    await expect(client.getAccessToken()).rejects.toMatchObject({ code: 'timeout', kind: 'transient' })
    hang = false
    expect(await client.getAccessToken()).toBe('access-2')
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
  const withApi = (refresh: () => Response = () => tokens(2)) => {
    const api: (string | null)[] = []
    const ctx = setup(({ url, body, headers }) => {
      if (url.startsWith('https://api.test') || url.startsWith('https://other.test')) {
        api.push(headers.get('authorization'))
        return new Response(null, { status: headers.get('authorization') === 'Bearer access-1' ? 401 : 200 })
      }
      return body.get('grant_type') === 'refresh_token' ? refresh() : tokens(1)
    }, { attachTo: ['https://api.test'] })
    return { ctx, api }
  }

  it('sends the bearer token, and refreshes and retries once on 401', async () => {
    const { ctx, api } = withApi()
    await signIn(ctx)
    const response = await ctx.client.fetch('https://api.test/me')
    expect(response.status).toBe(200)
    expect(api).toEqual(['Bearer access-1', 'Bearer access-2'])
  })

  it('sends no token to origins outside attachTo', async () => {
    const { ctx, api } = withApi()
    await signIn(ctx)
    await ctx.client.fetch('https://other.test/collect')
    expect(api).toEqual([null])
  })

  it('rejects, keeping the session, when the refresh after a 401 fails transiently', async () => {
    const { ctx } = withApi(() => json({}, 503))
    await signIn(ctx)
    await expect(ctx.client.fetch('https://api.test/me')).rejects.toBeInstanceOf(OAuthTransientError)
    expect(await ctx.client.isAuthenticated()).toBe(true)
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
