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
})
