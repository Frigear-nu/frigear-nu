import { fileURLToPath } from 'node:url'
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

// The key pair only exists for this run.
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
process.env.NUXT_OAUTH_SERVER_PRIVATE_KEY = privateKey.replaceAll('\n', '\\n')

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses
type Json = Record<string, any>

const CALLBACK = 'https://app.example.com/auth/frigear'

const send = (cookie: string, method: string, path: string, body?: unknown) => fetch(path, {
  method,
  headers: { 'content-type': 'application/json', cookie },
  body: body === undefined ? undefined : JSON.stringify(body),
})

async function ok(response: Response): Promise<Json> {
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response.json() as Promise<Json>
}

const claimsOf = (jwt: string): Json => JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString())

describe('preferences as OAuth claims', async () => {
  const dataDir = fileURLToPath(new URL('./fixtures/oauth/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/oauth', import.meta.url)),
    dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000,
  })

  async function signIn(email: string) {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', email, password: 'supersecret123' }),
    })
    expect(response.status, await response.clone().text()).toBe(200)
    return response.headers.get('set-cookie')!
  }

  /** Runs the code flow with PKCE as `cookie` and returns the tokens plus the authorize redirect. */
  async function exchange(cookie: string, app: Json, scope: string) {
    const verifier = randomBytes(32).toString('base64url')
    const query = {
      client_id: app.clientId,
      redirect_uri: CALLBACK,
      response_type: 'code',
      state: 'state-123',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      scope,
    }
    const decision = await ok(await send(cookie, 'POST', '/oauth/authorize', { ...query, approved: true }))
    const redirect = new URL(decision.redirectUrl)
    const token = await fetch('/oauth/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'authorization': `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: redirect.searchParams.get('code')!,
        redirect_uri: CALLBACK,
        code_verifier: verifier,
      }).toString(),
    })
    return { tokens: await ok(token), redirect }
  }

  it('forwards the opted-in preference with the profile scope only, and nothing else', async () => {
    const cookie = await signIn('claims-ada@example.com')
    const app = await ok(await send(cookie, 'POST', '/api/oauth-server/admin/applications', {
      name: 'Vouchers',
      websiteUrl: 'https://app.example.com',
      allowedRoles: [],
    }))
    const userinfo = (tokens: Json) => $fetch<Json>('/oauth/userinfo', { headers: { authorization: `Bearer ${tokens.access_token}` } })

    // Nothing stored yet: the claim is absent so applications keep their own default.
    const before = await exchange(cookie, app, 'openid profile')
    expect(claimsOf(before.tokens.id_token).color_mode).toBeUndefined()

    await ok(await send(cookie, 'PATCH', '/api/preferences', { colorMode: 'dark', compactTables: true }))

    const withProfile = await exchange(cookie, app, 'openid profile')
    const idToken = claimsOf(withProfile.tokens.id_token)
    expect(idToken.color_mode).toBe('dark')
    expect(idToken.compactTables).toBeUndefined()
    expect((await userinfo(withProfile.tokens)).color_mode).toBe('dark')
    expect(claimsOf(withProfile.tokens.access_token).color_mode).toBeUndefined()

    const withoutProfile = await exchange(cookie, app, 'openid email')
    expect(claimsOf(withoutProfile.tokens.id_token).color_mode).toBeUndefined()
    expect((await userinfo(withoutProfile.tokens)).color_mode).toBeUndefined()
  })
})
