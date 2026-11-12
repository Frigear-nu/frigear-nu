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

// A stand-in for frigear.nu: its key pair only exists for this run. It serves the JWKS and, for the users the tests
// sign tokens for, userinfo (`User<sub>@Frigear.test`; no email for sub 404, a token without the `email` scope). The
// real issuer verifies the token; this one only reads `sub`. It counts requests so the tests can see the caches work.
const issuerKey = generateKeyPairSync('rsa', pem)
const jwks = { keys: [{ ...await exportJWK(createPublicKey(issuerKey.publicKey)), kid: 'key-1', alg: 'RS256', use: 'sig' }] }
const issued = { jwks: 0, userinfo: 0 }
const issuer = createServer((request, response) => {
  response.setHeader('content-type', 'application/json')
  if (request.url === '/.well-known/jwks.json') {
    issued.jwks++
    return response.end(JSON.stringify(jwks))
  }
  if (request.url === '/oauth/userinfo') {
    issued.userinfo++
    const { sub } = decodeJwt(request.headers.authorization?.replace(/^Bearer /, '') ?? '')
    return response.end(JSON.stringify(sub === '404' ? { sub } : { sub, email: `User${sub}@Frigear.test`, email_verified: true, name: `User ${sub}` }))
  }
  response.statusCode = 404
  response.end('{}')
})
await new Promise<void>(resolve => issuer.listen(0, '127.0.0.1', resolve))
const issuerUrl = `http://127.0.0.1:${(issuer.address() as AddressInfo).port}`
process.env.NUXT_OAUTH_RESOURCE_JWKS_URL = `${issuerUrl}/.well-known/jwks.json`
process.env.NUXT_OAUTH_RESOURCE_USERINFO_URL = `${issuerUrl}/oauth/userinfo`

type TokenOptions = { sub?: string, scope?: string, permissions?: unknown, aud?: string | string[], iss?: string, typ?: string, exp?: string | number, kid?: string, key?: string, clientId?: string }

/** A token as frigear.nu issues it (`at+jwt`, shared audience, 10 minutes); every part can be overridden. */
async function accessToken(options: TokenOptions = {}) {
  return new SignJWT({
    scope: options.scope ?? 'openid email vouchers:read',
    client_id: options.clientId ?? 'app_mobile',
    ...(options.permissions !== undefined && { permissions: options.permissions }),
  })
    .setProtectedHeader({ alg: 'RS256', typ: options.typ ?? 'at+jwt', kid: options.kid ?? 'key-1' })
    .setIssuer(options.iss ?? ISSUER)
    .setSubject(options.sub ?? '1001')
    .setAudience(options.aud ?? 'frigear-services')
    .setIssuedAt()
    .setExpirationTime(options.exp ?? '10m')
    .setJti(crypto.randomUUID())
    .sign(await importPKCS8(options.key ?? issuerKey.privateKey, 'RS256'))
}

const vouchers = '/api/test/vouchers'
const asBearer = async (options: TokenOptions = {}) => apiClient({ bearer: await accessToken(options) })
const counters = async () => ({ ...issued })

describe('oauth-resource (a service accepting frigear.nu tokens)', async () => {
  const dataDir = fileURLToPath(new URL('./fixtures/basic/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(async () => {
    issuer.close()
    await rm(dataDir, { recursive: true, force: true })
  })

  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
    // Dev mode lets NuxtHub apply the committed migrations on startup.
    dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000,
  })

  describe('the resolver', () => {
    it('accepts a valid token and provisions the unknown user under the frigear.nu id', async () => {
      const before = await counters()
      const me = await (await asBearer({ sub: '1001' })).json<Json>('GET', vouchers)
      expect(me).toEqual({
        kind: 'oauth',
        // `forceId` (from `runtimeConfig.frigear`): the local id is `sub`.
        userId: 1001,
        // Read from the issuer's userinfo with the token, stored lowercased.
        email: 'user1001@frigear.test',
        name: 'User 1001',
        clientId: 'app_mobile',
        scopes: ['openid', 'email', 'vouchers:read'],
        // Without a `permissions` claim (an older issuer): its scopes, against this service's permissions.
        permissions: ['vouchers:read'],
        foreign: true,
      })
      expect((await counters()).userinfo).toBe(before.userinfo + 1)
    })

    it('finds a known user without asking the issuer again, and caches the keys', async () => {
      await (await asBearer({ sub: '1002' })).json('GET', vouchers)
      const before = await counters()
      for (let i = 0; i < 3; i++) {
        expect(await (await asBearer({ sub: '1002' })).json<Json>('GET', vouchers)).toMatchObject({ userId: 1002 })
      }
      expect(await counters()).toEqual(before)
    })

    it('rejects expired tokens', async () => {
      const expired = await accessToken({ exp: Math.floor(Date.now() / 1000) - 60 })
      const response = await fetch(vouchers, { headers: { authorization: `Bearer ${expired}` } })
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"')
      await expectApiError(apiClient({ bearer: expired }).json('GET', vouchers), 401, 'unauthorized')
    })

    it('rejects a token for another audience', async () => {
      await expectApiError((await asBearer({ aud: 'app_mobile' })).json('GET', vouchers), 401, 'unauthorized')
      await expectApiError((await asBearer({ aud: ['another-service'] })).json('GET', vouchers), 401, 'unauthorized')
      // One of several audiences is enough.
      expect(await (await asBearer({ aud: ['another-service', 'frigear-services'] })).json<Json>('GET', vouchers)).toMatchObject({ kind: 'oauth' })
    })

    it('rejects a token of another issuer, of another type, or signed with another key', async () => {
      await expectApiError((await asBearer({ iss: 'https://evil.example.test' })).json('GET', vouchers), 401, 'unauthorized')
      // An ID token is not an access token.
      await expectApiError((await asBearer({ typ: 'JWT' })).json('GET', vouchers), 401, 'unauthorized')
      const impostor = generateKeyPairSync('rsa', pem)
      await expectApiError((await asBearer({ key: impostor.privateKey })).json('GET', vouchers), 401, 'unauthorized')
      await expectApiError((await asBearer({ key: impostor.privateKey, kid: 'key-9' })).json('GET', vouchers), 401, 'unauthorized')
      await expectApiError(apiClient({ bearer: 'not.a.jwt' }).json('GET', vouchers), 401, 'unauthorized')
    })

    it('answers 403 insufficient_scope when the token lacks the scope the route needs', async () => {
      const response = await fetch(vouchers, { headers: { authorization: `Bearer ${await accessToken({ scope: 'openid email shop:order' })}` } })
      expect(response.status).toBe(403)
      expect(response.headers.get('www-authenticate')).toBe('Bearer error="insufficient_scope", scope="vouchers:read"')
      expect(await response.json()).toMatchObject({ data: { code: 'insufficient_scope' } })
    })

    it('takes what a token may do from its permissions claim, not from the scopes or this service\'s roles', async () => {
      const claimed = await (await asBearer({ sub: '1003', scope: 'openid email', permissions: ['vouchers:read'] })).json<Json>('GET', vouchers)
      expect(claimed).toMatchObject({ kind: 'oauth', userId: 1003, permissions: ['vouchers:read'], foreign: true })

      // The claim wins over the scope: an issuer that froze nothing gave nothing.
      const empty = await fetch(vouchers, { headers: { authorization: `Bearer ${await accessToken({ sub: '1003', permissions: [] })}` } })
      expect(empty.status).toBe(403)
      expect(await empty.json()).toMatchObject({ data: { code: 'insufficient_scope' } })
      // A malformed claim is refused outright.
      await expectApiError((await asBearer({ sub: '1003', permissions: 'vouchers:read' })).json('GET', vouchers), 401, 'unauthorized')
    })

    it('refuses a token whose user cannot be provisioned (no email from the issuer)', async () => {
      await expectApiError((await asBearer({ sub: '404' })).json('GET', vouchers), 401, 'unauthorized')
    })

    it('refetches the keys for an unknown key id, at most once per cooldown', async () => {
      const before = await counters()
      const impostor = generateKeyPairSync('rsa', pem)
      await expectApiError((await asBearer({ key: impostor.privateKey, kid: 'key-new' })).json('GET', vouchers), 401, 'unauthorized')
      await expectApiError((await asBearer({ key: impostor.privateKey, kid: 'key-new' })).json('GET', vouchers), 401, 'unauthorized')
      // A rotation at the issuer is picked up, but garbage key ids cannot make every request refetch.
      expect((await counters()).jwks - before.jwks).toBeLessThanOrEqual(1)
    })
  })

  describe('bearer-only CORS', () => {
    const preflight = (origin: string, path = vouchers) => fetch(path, {
      method: 'OPTIONS',
      headers: { 'origin': origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' },
    })

    it('answers preflights of the mobile app\'s webviews by default, without credentials', async () => {
      for (const origin of ['capacitor://localhost', 'https://localhost']) {
        const response = await preflight(origin)
        expect(response.status).toBe(204)
        expect(response.headers.get('access-control-allow-origin')).toBe(origin)
        expect(response.headers.get('access-control-allow-headers')).toContain('authorization')
        expect(response.headers.get('access-control-allow-credentials')).toBeNull()
        expect(response.headers.get('vary')).toContain('Origin')
      }
    })

    it('adds the headers to real responses', async () => {
      const response = await fetch(vouchers, { headers: { origin: 'capacitor://localhost', authorization: `Bearer ${await accessToken()}` } })
      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost')
    })

    it('gives other origins and other paths nothing', async () => {
      const other = await preflight('https://evil.example.test')
      expect(other.headers.get('access-control-allow-origin')).toBeNull()
      const page = await fetch('/', { headers: { origin: 'capacitor://localhost' } })
      expect(page.headers.get('access-control-allow-origin')).toBeNull()
    })
  })
})
