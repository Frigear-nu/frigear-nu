import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'

const fixture = fileURLToPath(new URL('./fixtures/api-tokens-custom', import.meta.url))
const dataDir = `${fixture}/.data`

async function call(method: string, path: string, options: { body?: unknown, cookie?: string, bearer?: string } = {}) {
  return fetch(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

describe('auth tokens (host prefix)', async () => {
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir: fixture, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  let cookie: string

  it('issues tokens with the configured prefix and authenticates with them', async () => {
    const login = await call('POST', '/api/test/login', { body: { id: 1 } })
    expect(login.status, await login.clone().text()).toBe(200)
    cookie = login.headers.get('set-cookie')!.split(';')[0]!

    const response = await call('POST', '/api/auth/tokens', { cookie, body: { name: 'CI', scopes: ['events:read'] } })
    expect(response.status, await response.clone().text()).toBe(200)
    const created = await response.json() as { token: string, prefix: string }
    expect(created.token).toMatch(/^acme_[\w-]{43}$/)
    expect(created.prefix).toBe(created.token.slice(0, 9))

    const me = await call('GET', '/api/test/me', { bearer: created.token })
    expect(me.status, await me.clone().text()).toBe(200)
    expect(await me.json()).toMatchObject({ kind: 'user-token', user: { id: 1 }, scopes: ['events:read'] })
  })

  it('no longer claims tokens with the default prefix', async () => {
    // An unclaimed bearer is ignored, so the cookie session applies; a claimed-but-invalid one is rejected.
    const unclaimed = await call('GET', '/api/test/me', { cookie, bearer: 'fnu_not-a-real-token' })
    expect(unclaimed.status, await unclaimed.clone().text()).toBe(200)
    expect(await unclaimed.json()).toMatchObject({ kind: 'session', user: { id: 1 } })
    expect((await call('GET', '/api/test/me', { cookie, bearer: 'acme_not-a-real-token' })).status).toBe(401)
  })
})
