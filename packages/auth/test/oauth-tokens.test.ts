import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { afterAll, describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'

const fixture = fileURLToPath(new URL('./fixtures/oauth-tokens', import.meta.url))
const dataDir = `${fixture}/.data`

// The fixture's own routes play the provider, so its discovery URL needs the port before the server starts.
const port = await new Promise<number>((resolve) => {
  const server = createServer().listen(0, () => {
    const { port } = server.address() as { port: number }
    server.close(() => resolve(port))
  })
})

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- loose JSON responses

const post = (path: string, body: unknown, cookie?: string) => fetch(path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
})
const get = async (path: string, cookie?: string) => (await fetch(path, { headers: cookie ? { cookie } : {} })).json() as Promise<Json>

describe('kept OAuth tokens (database)', async () => {
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))
  process.env.NUXT_OAUTH_OIDC_OPENID_CONFIG = `http://127.0.0.1:${port}/api/test/idp/openid-configuration`
  // Only from the environment: the token key falls back to it through the `session.password` key auth declares.
  process.env.NUXT_SESSION_PASSWORD = 'a-test-only-session-password-at-least-32-chars'
  // The fake frigear.nu of the browser handoff (a public client: `frigear.sso.clientId` only).
  process.env.NUXT_FRIGEAR_SSO_URL = `http://127.0.0.1:${port}/api/test/issuer`

  await setup({ rootDir: fixture, dev: true, port, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  let cookie: string

  it('stores tokens encrypted at rest and reads them back for the caller and by user id', async () => {
    cookie = (await post('/api/test/login', {})).headers.get('set-cookie')!.split(';')[0]!
    const stored = await post('/api/test/store', {
      provider: 'oidc',
      response: { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, scope: 'openid users:read' },
    })
    expect(stored.status, await stored.clone().text()).toBe(200)

    const [row] = await get('/api/test/raw') as unknown as Json[]
    expect(row).toMatchObject({ userId: 1, provider: 'oidc', scopes: ['openid', 'users:read'] })
    expect(row!.accessToken).toMatch(/^v1\./)
    expect(JSON.stringify(row)).not.toContain('access-1')
    expect(JSON.stringify(row)).not.toContain('refresh-1')

    const mine = await get('/api/test/tokens?provider=oidc', cookie)
    expect(mine.tokens).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1', scopes: ['openid', 'users:read'] })
    expect(mine.accessToken).toBe('access-1')
    expect((await get('/api/test/tokens?provider=oidc&user=1')).accessToken).toBe('access-1')
    expect((await get('/api/test/tokens?provider=oidc')).tokens).toBeNull()
    expect((await get('/api/test/tokens?provider=github&user=1')).tokens).toBeNull()
  })

  it('withholds a token that lacks a requested scope', async () => {
    expect((await get('/api/test/tokens?provider=oidc&user=1&scopes=users:read')).accessToken).toBe('access-1')
    expect((await get('/api/test/tokens?provider=oidc&user=1&scopes=users:write')).accessToken).toBeNull()
  })

  it('refreshes an expired token once at the token endpoint and stores the rotated tokens', async () => {
    await post('/api/test/expire', {})
    const before = (await get('/api/test/refreshes')).count
    const results = await Promise.all([1, 2, 3].map(() => get('/api/test/tokens?provider=oidc&user=1')))
    expect(results.map(result => result.accessToken)).toEqual(['access-2', 'access-2', 'access-2'])
    expect((await get('/api/test/refreshes')).count).toBe(before + 1)
    expect((await get('/api/test/tokens?provider=oidc&user=1')).tokens).toMatchObject({ refreshToken: 'refresh-2', scopes: ['openid', 'users:read'] })
  })

  it('is null when an expired token cannot be refreshed', async () => {
    await post('/api/test/expire', {})
    // The fake provider only accepts `refresh-1`; `refresh-2` is refused.
    expect((await get('/api/test/tokens?provider=oidc&user=1')).accessToken).toBeNull()
  })

  it('replaces the row at the next login and forgets it on revoke', async () => {
    await post('/api/test/store', { provider: 'oidc', response: { access_token: 'access-3' }, scopes: ['openid'] })
    const rows = await get('/api/test/raw') as unknown as Json[]
    expect(rows).toHaveLength(1)
    expect((await get('/api/test/tokens?provider=oidc&user=1')).tokens).toEqual({ accessToken: 'access-3', scopes: ['openid'], expiresAt: null })

    await post('/api/test/revoke', { provider: 'oidc' })
    expect(await get('/api/test/raw')).toEqual([])
  })

  const cookiesOf = (response: Response) => response.headers.getSetCookie().map(cookie => cookie.split(';')[0]!)
  const sessionOf = (response: Response) => cookiesOf(response).find(cookie => cookie.startsWith('nuxt-auth-session='))
  const handoffs = '/api/auth/frigear/handoffs'

  it('signs a desktop window in through the system browser (handoff, public client)', async () => {
    const started = await post(handoffs, { redirect: '/events' })
    expect(started.status, await started.clone().text()).toBe(201)
    const attempt = await started.json() as Json
    const windowCookie = cookiesOf(started).find(cookie => cookie.startsWith('auth-frigear-handoff='))!
    expect(windowCookie).toBeDefined()
    expect(attempt).toMatchObject({ status: 'pending', error: null })
    const authorize = new URL(attempt.authorizeUrl)
    expect(authorize.searchParams.get('redirect_uri')).toBe(`http://127.0.0.1:${port}/auth/frigear`)
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorize.searchParams.get('client_id')).toBe('desktop-client')

    // Only this window's cookie reads the attempt; nothing is collected before the browser came back.
    expect((await fetch(`${handoffs}/${attempt.id}`)).status).toBe(401)
    expect((await fetch(`${handoffs}/${attempt.id}`, { headers: { cookie: 'auth-frigear-handoff=another-window' } })).status).toBe(403)
    expect((await get(`${handoffs}/${attempt.id}`, windowCookie)).status).toBe('pending')
    const early = await post(`${handoffs}/${attempt.id}/complete`, {}, windowCookie)
    expect(early.status).toBe(409)
    expect((await early.json() as Json).data.code).toBe('handoff_pending')

    // The system browser: frigear.nu sends it back to this server, which completes the attempt but signs nobody in there.
    const toCallback = await globalThis.fetch(attempt.authorizeUrl, { redirect: 'manual' })
    const callbackUrl = toCallback.headers.get('location')!
    const page = await globalThis.fetch(callbackUrl, { redirect: 'manual' })
    const html = await page.text()
    expect(page.status, html).toBe(200)
    expect(html).toContain('Signed in')
    expect(html).toContain('frigear-test:/auth/return')
    expect(sessionOf(page)).toBeUndefined()
    expect((await get(`${handoffs}/${attempt.id}`, windowCookie)).status).toBe('complete')

    // The window collects the session, once.
    const done = await post(`${handoffs}/${attempt.id}/complete`, {}, windowCookie)
    expect(done.status, await done.clone().text()).toBe(200)
    expect(await done.json()).toEqual({ redirect: '/events' })
    const session = sessionOf(done)!
    expect(session).toBeDefined()
    expect((await get('/api/_auth/session', session)).user).toMatchObject({ email: 'grace@example.com' })
    expect((await post(`${handoffs}/${attempt.id}/complete`, {}, windowCookie)).status).toBe(403)
    expect(await get('/api/test/handoffs')).toEqual([])

    // A public client: no secret at the token endpoint. The issuer tokens are kept as for the redirect login.
    const exchanges = await get('/api/test/issuer/exchanges') as unknown as Json[]
    expect(exchanges.at(-1)).not.toHaveProperty('client_secret')
    expect((await get('/api/test/tokens?provider=frigear', session)).accessToken).toBe('issuer-access')

    // A replayed callback finds nothing to complete.
    expect((await globalThis.fetch(callbackUrl, { redirect: 'manual' })).status).toBe(400)
  })

  it('tells the window when the sign-in was refused in the browser, and lets it cancel', async () => {
    const started = await post(handoffs, {})
    const attempt = await started.json() as Json
    const windowCookie = cookiesOf(started).find(cookie => cookie.startsWith('auth-frigear-handoff='))!
    const state = new URL(attempt.authorizeUrl).searchParams.get('state')!
    const page = await globalThis.fetch(`http://127.0.0.1:${port}/auth/frigear?error=access_denied&state=${encodeURIComponent(state)}`, { redirect: 'manual' })
    expect(page.status).toBe(400)
    expect(await get(`${handoffs}/${attempt.id}`, windowCookie)).toMatchObject({ status: 'failed', error: 'access_denied' })
    const refused = await post(`${handoffs}/${attempt.id}/complete`, {}, windowCookie)
    expect(refused.status).toBe(409)
    expect((await refused.json() as Json).data).toMatchObject({ code: 'handoff_failed', error: 'access_denied' })

    const next = await post(handoffs, {})
    const other = await next.json() as Json
    const otherCookie = cookiesOf(next).find(cookie => cookie.startsWith('auth-frigear-handoff='))!
    expect((await fetch(`${handoffs}/${other.id}`, { method: 'DELETE', headers: { cookie: otherCookie } })).status).toBe(204)
    expect(await get('/api/test/handoffs')).toEqual([])
  })

  it('signs a web browser in as a public client through the redirect flow, without a secret', async () => {
    const start = await fetch('/auth/frigear', { redirect: 'manual' })
    expect(start.status).toBe(302)
    const authorize = new URL(start.headers.get('location')!)
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
    const toCallback = await globalThis.fetch(authorize, { redirect: 'manual' })
    const callback = await globalThis.fetch(toCallback.headers.get('location')!, { redirect: 'manual', headers: { cookie: cookiesOf(start).join('; ') } })
    expect(callback.status, await callback.clone().text()).toBe(302)
    expect(sessionOf(callback), callback.headers.get('location') ?? '').toBeDefined()
    const exchanges = await get('/api/test/issuer/exchanges') as unknown as Json[]
    // RFC 6749 §3.2: an empty parameter counts as omitted.
    expect(exchanges.at(-1)!.client_secret ?? '').toBe('')
  })
})
