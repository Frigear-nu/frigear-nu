import { fileURLToPath } from 'node:url'
import { createPublicKey, generateKeyPairSync } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { SignJWT, decodeJwt, exportJWK, importPKCS8 } from 'jose'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'

type Json = Record<string, unknown>

const ISSUER = 'https://frigear.example.test'
const pem = { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } } as const

// A stand-in for the issuer (as in `resource.test.ts`): its JWKS, and userinfo for `User<sub>@Frigear.test`.
const issuerKey = generateKeyPairSync('rsa', pem)
const jwks = { keys: [{ ...await exportJWK(createPublicKey(issuerKey.publicKey)), kid: 'key-1', alg: 'RS256', use: 'sig' }] }
const issuer = createServer((request, response) => {
  response.setHeader('content-type', 'application/json')
  if (request.url === '/.well-known/jwks.json') return response.end(JSON.stringify(jwks))
  if (request.url === '/oauth/userinfo') {
    const { sub } = decodeJwt(request.headers.authorization?.replace(/^Bearer /, '') ?? '')
    return response.end(JSON.stringify({ sub, email: `User${sub}@Frigear.test`, email_verified: true, name: `User ${sub}` }))
  }
  response.statusCode = 404
  response.end('{}')
})
await new Promise<void>(resolve => issuer.listen(0, '127.0.0.1', resolve))
const issuerUrl = `http://127.0.0.1:${(issuer.address() as AddressInfo).port}`
process.env.NUXT_OAUTH_RESOURCE_JWKS_URL = `${issuerUrl}/.well-known/jwks.json`
process.env.NUXT_OAUTH_RESOURCE_USERINFO_URL = `${issuerUrl}/oauth/userinfo`

/** An `at+jwt` for the shared audience; `clientId` defaults to the app's own (`authentication.client.clientId`). */
async function accessToken(options: { sub?: string, scope?: string, clientId?: string, permissions?: string[] } = {}) {
  return new SignJWT({
    scope: options.scope ?? 'openid email',
    client_id: options.clientId ?? 'app_desktop',
    ...(options.permissions && { permissions: options.permissions }),
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'key-1' })
    .setIssuer(ISSUER)
    .setSubject(options.sub ?? '2001')
    .setAudience('frigear-services')
    .setIssuedAt()
    .setExpirationTime('10m')
    .setJti(crypto.randomUUID())
    .sign(await importPKCS8(issuerKey.privateKey, 'RS256'))
}

const asBearer = async (options: Parameters<typeof accessToken>[0] = {}) => apiClient({ bearer: await accessToken(options) })

describe('oauth-resource with auth in resource mode', async () => {
  const dataDir = fileURLToPath(new URL('./fixtures/resource-mode/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(async () => {
    issuer.close()
    await rm(dataDir, { recursive: true, force: true })
  })

  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/resource-mode', import.meta.url)),
    // Dev mode lets NuxtHub apply the committed migrations on startup.
    dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000,
  })

  it('answers 401 without a token, with no session to fall back on', async () => {
    const response = await fetch('/api/test/notes')
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    await expectApiError(apiClient().json('GET', '/api/test/notes'), 401, 'unauthorized')
  })

  it('accepts the issuer\'s token for the app\'s own sign-in and provisions the user', async () => {
    expect(await (await asBearer({ sub: '2001' })).json<Json>('GET', '/api/test/notes')).toEqual({
      kind: 'oauth',
      userId: expect.any(Number),
      email: 'user2001@frigear.test',
      foreign: false,
    })
  })

  it('gives the app\'s own sign-in the user\'s roles here; other clients\' tokens stay foreign', async () => {
    // `notes:write` comes from the `member` role, which the token's scopes know nothing about.
    expect(await (await asBearer({ sub: '2002' })).json<Json>('POST', '/api/test/notes')).toMatchObject({ foreign: false })
    // Another client's token holds its scopes, as in server mode: `notes:read`, not the role's `notes:write`.
    const other = { sub: '2002', clientId: 'app_other', scope: 'openid email notes:read' }
    expect(await (await asBearer(other)).json<Json>('GET', '/api/test/notes')).toMatchObject({ foreign: true })
    await expectApiError((await asBearer(other)).json('POST', '/api/test/notes'), 403, 'insufficient_scope')
    // `/api/auth/me/access` answers the app's own registry for the UI.
    const access = await (await asBearer({ sub: '2002' })).json<Json>('GET', '/api/auth/me/access')
    expect(access).toMatchObject({ kind: 'oauth', permissions: expect.arrayContaining(['notes:read', 'notes:write']) })
    expect(access.permissions).not.toContain('account:delete')
  })

  it('never grants a session-only permission', async () => {
    await expectApiError((await asBearer({ sub: '2003' })).json('DELETE', '/api/test/account'), 403, 'session_required')
  })
})
