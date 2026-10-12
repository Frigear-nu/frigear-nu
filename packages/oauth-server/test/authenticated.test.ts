import { fileURLToPath } from 'node:url'
import { generateKeyPairSync } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { SignJWT, createLocalJWKSet, decodeProtectedHeader, decodeJwt, importPKCS8, jwtVerify } from 'jose'
import { CALLBACK, authorizeQuery, basic, form, json, ok, pkce, registerUser } from './helpers'
import type { Json, Session } from './helpers'

// The key pair only exists for this run. A single-line PEM with literal `\n` is what env files hold.
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
process.env.NUXT_OAUTH_SERVER_PRIVATE_KEY = privateKey.replaceAll('\n', '\\n')

// A key that was rotated out: only its public half is configured, as `{ kid: pem }` JSON.
const retired = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
process.env.NUXT_OAUTH_SERVER_PREVIOUS_PUBLIC_KEYS = JSON.stringify({ 'key-0': retired.publicKey })

let counter = 0

describe('oauth-server (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true })

  const user = (name: string, domain = 'member.test') => registerUser(name, `${name.toLowerCase()}${++counter}@${domain}`)
  let staff: Session

  async function createApp(overrides: Json = {}) {
    staff ??= await user('Staff', 'staff.test')
    return ok(await json(staff.cookie, 'POST', '/api/oauth-server/admin/applications', {
      name: `App ${++counter}`,
      websiteUrl: 'https://app.example.com',
      allowedRoles: ['staff'],
      ...overrides,
    }))
  }

  /** Runs the whole flow up to the redirect with a code; returns the code (or the failing response). */
  async function authorizeCode(session: Session, clientId: string, challenge: string, extra: Record<string, string> = {}) {
    const query = authorizeQuery(clientId, challenge, extra)
    const entry = await fetch(`/oauth/authorize?${query}`, { headers: { cookie: session.cookie }, redirect: 'manual' })
    expect(entry.status, await entry.clone().text()).toBe(302)
    expect(entry.headers.get('location')).toBe(`/authorize?${query}`)
    const decision = await ok(await json(session.cookie, 'POST', '/oauth/authorize', { ...Object.fromEntries(query), approved: true }))
    const url = new URL(decision.redirectUrl)
    expect(`${url.origin}${url.pathname}`).toBe(CALLBACK)
    expect(url.searchParams.get('state')).toBe('state-123')
    return url.searchParams.get('code')!
  }

  const tokenRequest = (app: Json, body: Record<string, string>) =>
    form('/oauth/token', body, { authorization: basic(app.clientId, app.clientSecret) })

  describe('discovery', () => {
    it('serves the OIDC configuration and a public-only JWKS', async () => {
      const config = await $fetch<Json>('/.well-known/openid-configuration')
      expect(config.issuer).toBe('https://id.example.test')
      expect(config.token_endpoint).toBe('https://id.example.test/oauth/token')
      expect(config.scopes_supported).toEqual(['openid', 'profile', 'email', 'groups'])
      expect(config.code_challenge_methods_supported).toEqual(['S256'])

      const jwks = await $fetch<Json>('/.well-known/jwks.json')
      expect(jwks.keys).toHaveLength(2) // the current key and the retired one, see the rotation tests
      expect(jwks.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig', kid: 'key-1' })
      expect(jwks.keys[0].d).toBeUndefined()
    })

    it('keeps publishing the previous key while rotating', async () => {
      const jwks = await $fetch<Json>('/.well-known/jwks.json')
      expect(jwks.keys.map((key: Json) => key.kid)).toEqual(['key-1', 'key-0'])
      for (const key of jwks.keys) expect(key.d).toBeUndefined()
    })
  })

  describe('admin gate and application management', () => {
    it('denies by default: anonymous 401, non-staff 403', async () => {
      expect((await json(undefined, 'GET', '/api/oauth-server/admin/applications')).status).toBe(401)
      const member = await user('Member')
      expect((await json(member.cookie, 'GET', '/api/oauth-server/admin/applications')).status).toBe(403)
      expect((await json(member.cookie, 'POST', '/api/oauth-server/admin/applications', { name: 'x', websiteUrl: 'https://x.test' })).status).toBe(403)
    })

    it('validates input', async () => {
      staff ??= await user('Staff', 'staff.test')
      const post = (body: Json) => json(staff.cookie, 'POST', '/api/oauth-server/admin/applications', body)
      expect((await post({ name: 'x', websiteUrl: 'http://app.example.com' })).status).toBe(400)
      expect((await post({ name: 'x', websiteUrl: 'https://app.example.com/path' })).status).toBe(400)
      expect((await post({ name: '', websiteUrl: 'https://app.example.com' })).status).toBe(400)
      expect((await post({ name: 'x', websiteUrl: 'https://app.example.com', previewUrlPattern: 'http://*.x.dev' })).status).toBe(400)
    })

    it('creates, lists, edits and deletes without leaking secrets', async () => {
      const created = await createApp({ tags: ['b', 'a', 'a'], allowedRoles: ['staff', 'member', 'staff'] })
      expect(created.clientId).toBe(created.id)
      expect(created.clientId).toMatch(/^app_/)
      expect(created.clientSecret).toHaveLength(64)
      expect(created.secretHash).toBeUndefined()
      expect(created.allowedRoles).toEqual(['member', 'staff'])
      expect(created.tags).toEqual(['b', 'a'])

      const list = await ok(await json(staff.cookie, 'GET', '/api/oauth-server/admin/applications')) as unknown as Json[]
      const listed = list.find(application => application.id === created.id)!
      expect(listed.callbackUrl).toBe(CALLBACK)
      expect(listed.secretHash).toBeUndefined()
      expect(listed.clientSecret).toBeUndefined()

      const edited = await ok(await json(staff.cookie, 'PATCH', `/api/oauth-server/admin/applications/${created.id}`, { name: 'Renamed', priority: 5 }))
      expect(edited).toMatchObject({ name: 'Renamed', priority: 5, websiteUrl: 'https://app.example.com' })

      await ok(await json(staff.cookie, 'DELETE', `/api/oauth-server/admin/applications/${created.id}`))
      expect((await json(staff.cookie, 'GET', `/api/oauth-server/admin/applications/${created.id}`)).status).toBe(404)
    })
  })

  describe('authorization code flow with PKCE', () => {
    it('rejects invalid requests before anything is redirected', async () => {
      const app = await createApp()
      const { challenge } = pkce()
      const get = (query: URLSearchParams) => fetch(`/oauth/authorize?${query}`, { redirect: 'manual' })
      expect((await get(authorizeQuery(app.clientId, challenge, { redirect_uri: 'https://evil.example.com/auth/frigear' }))).status).toBe(400)
      expect((await get(authorizeQuery('app_unknown', challenge))).status).toBe(400)
      expect((await get(authorizeQuery(app.clientId, challenge, { code_challenge_method: 'plain' }))).status).toBe(400)
      expect((await get(authorizeQuery(app.clientId, challenge, { scope: 'nope' }))).status).toBe(400)
    })

    it('sends anonymous users to the login page and back', async () => {
      const app = await createApp()
      const query = authorizeQuery(app.clientId, pkce().challenge)
      const response = await fetch(`/oauth/authorize?${query}`, { redirect: 'manual' })
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${query}`)}`)
    })

    it('checks the role of the user', async () => {
      const app = await createApp({ allowedRoles: ['staff'] })
      const member = await user('Member')
      const nobody = await user('Nobody', 'nobody.test')
      const query = authorizeQuery(app.clientId, pkce().challenge)

      for (const denied of [member, nobody]) {
        const response = await fetch(`/oauth/authorize?${query}`, { headers: { cookie: denied.cookie }, redirect: 'manual' })
        expect(response.status).toBe(403)
        // The consent page and the approval enforce it too, not just the entry point.
        expect((await json(denied.cookie, 'GET', `/api/oauth-server/consent?${query}`)).status).toBe(403)
        expect((await json(denied.cookie, 'POST', '/oauth/authorize', { ...Object.fromEntries(query), approved: true })).status).toBe(403)
      }
      expect((await fetch(`/oauth/authorize?${query}`, { headers: { cookie: staff.cookie }, redirect: 'manual' })).status).toBe(302)
    })

    it('lets everyone in when no roles are required, unless the host vetoes', async () => {
      const app = await createApp({ allowedRoles: [] })
      const nobody = await user('Nobody', 'nobody.test')
      const query = authorizeQuery(app.clientId, pkce().challenge)
      expect((await fetch(`/oauth/authorize?${query}`, { headers: { cookie: nobody.cookie }, redirect: 'manual' })).status).toBe(302)

      const blocked = await registerUser('Blocked', `blocked${++counter}@member.test`)
      const response = await fetch(`/oauth/authorize?${query}`, { headers: { cookie: blocked.cookie }, redirect: 'manual' })
      expect(response.status).toBe(403)
      expect(await response.text()).toContain('Blocked by policy.')
    })

    it('shows the consent data with only supported scopes', async () => {
      const app = await createApp()
      const query = authorizeQuery(app.clientId, pkce().challenge, { scope: 'openid email unknown' })
      const consent = await ok(await json(staff.cookie, 'GET', `/api/oauth-server/consent?${query}`))
      expect(consent.application).toMatchObject({ id: app.clientId, name: app.name })
      expect(consent.scope).toEqual(['openid', 'email'])
      expect((await json(undefined, 'GET', `/api/oauth-server/consent?${query}`)).status).toBe(401)
    })

    it('returns access_denied to the application when the user declines', async () => {
      const app = await createApp()
      const query = authorizeQuery(app.clientId, pkce().challenge)
      const { redirectUrl } = await ok(await json(staff.cookie, 'POST', '/oauth/authorize', { ...Object.fromEntries(query), approved: false }))
      const url = new URL(redirectUrl)
      expect(url.searchParams.get('error')).toBe('access_denied')
      expect(url.searchParams.get('state')).toBe('state-123')
      expect(url.searchParams.get('code')).toBeNull()
    })

    it('exchanges the code for verifiable, host-enriched tokens', async () => {
      const app = await createApp()
      const { verifier, challenge } = pkce()
      const code = await authorizeCode(staff, app.clientId, challenge, { scope: 'openid profile email groups', nonce: 'nonce-1' })

      // Wrong secret, wrong verifier and wrong redirect all fail, and each attempt burns the code.
      const bad = await form('/oauth/token', { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier }, { authorization: basic(app.clientId, 'wrong') })
      expect(bad.status).toBe(401)
      expect(bad.headers.get('www-authenticate')).toBe('Basic')
      expect(await bad.json()).toMatchObject({ error: 'invalid_client' })

      const wrongVerifier = await authorizeCode(staff, app.clientId, challenge)
      const mismatch = await tokenRequest(app, { grant_type: 'authorization_code', code: wrongVerifier, redirect_uri: CALLBACK, code_verifier: pkce().verifier })
      expect(mismatch.status).toBe(400)
      expect(await mismatch.json()).toMatchObject({ error: 'invalid_grant' })

      const response = await tokenRequest(app, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier })
      expect(response.status, await response.clone().text()).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const tokens = await response.json() as Json
      expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'openid profile email groups' })

      // The code is single use.
      const replay = await tokenRequest(app, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier })
      expect(replay.status).toBe(400)

      const jwks = createLocalJWKSet(await $fetch<Json>('/.well-known/jwks.json') as never)
      const { payload, protectedHeader } = await jwtVerify(tokens.id_token, jwks, { issuer: 'https://id.example.test', audience: app.clientId })
      expect(protectedHeader).toMatchObject({ alg: 'RS256', kid: 'key-1' })
      expect(payload).toMatchObject({
        'sub': String(staff.id),
        'nonce': 'nonce-1',
        'name': expect.stringMatching(/^Staff/),
        'email': expect.stringMatching(/@staff\.test$/),
        'role': 'staff',
        'https://frigear.test/claims/role': 'staff',
        'groups': ['staff', 'member'],
      })
      expect(payload.auth_time).toBeTypeOf('number')

      // Registered claims cannot be overwritten by the host hook.
      expect(payload.sub).not.toBe('attacker')

      // Access tokens stay bare: no identity claims, and a distinct type.
      expect(decodeProtectedHeader(tokens.access_token).typ).toBe('at+jwt')
      const access = decodeJwt(tokens.access_token)
      expect(access).toMatchObject({ sub: String(staff.id), client_id: app.clientId, scope: 'openid profile email groups' })
      expect(access.email).toBeUndefined()
      expect(access.name).toBeUndefined()

      const issued = await $fetch<Json[]>('/api/test/issued')
      expect(issued).toContainEqual({ applicationId: app.clientId, grant: 'authorization_code' })
    })

    it('serves userinfo for access tokens only, filtered by scope', async () => {
      const app = await createApp()
      const { verifier, challenge } = pkce()
      const code = await authorizeCode(staff, app.clientId, challenge, { scope: 'openid email' })
      const tokens = await (await tokenRequest(app, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier })).json() as Json

      const userinfo = await $fetch<Json>('/oauth/userinfo', { headers: { authorization: `Bearer ${tokens.access_token}` } })
      expect(userinfo).toMatchObject({ sub: String(staff.id), email: expect.stringMatching(/@staff\.test$/), role: 'staff' })
      expect(userinfo.name).toBeUndefined()

      expect((await fetch('/oauth/userinfo')).status).toBe(401)
      expect((await fetch('/oauth/userinfo', { headers: { authorization: `Bearer ${tokens.id_token}` } })).status).toBe(401)
      expect((await fetch('/oauth/userinfo', { headers: { authorization: 'Bearer garbage' } })).status).toBe(401)
    })

    it('accepts client credentials in the body too', async () => {
      const app = await createApp()
      const { verifier, challenge } = pkce()
      const code = await authorizeCode(staff, app.clientId, challenge)
      const response = await form('/oauth/token', { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier, client_id: app.clientId, client_secret: app.clientSecret })
      expect(response.status, await response.clone().text()).toBe(200)
    })
  })

  describe('refresh tokens', () => {
    async function signIn(app: Json) {
      const { verifier, challenge } = pkce()
      const code = await authorizeCode(staff, app.clientId, challenge)
      return await (await tokenRequest(app, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier })).json() as Json
    }
    const refresh = (app: Json, token: string) => tokenRequest(app, { grant_type: 'refresh_token', refresh_token: token })

    it('rotates, and revokes the whole family when an old token is replayed', async () => {
      const app = await createApp()
      const first = await signIn(app)

      const second = await ok(await refresh(app, first.refresh_token))
      expect(second.refresh_token).not.toBe(first.refresh_token)
      expect(second.access_token).toBeTypeOf('string')
      expect(second.id_token).toBeTypeOf('string') // `openid` is part of the scope

      const replay = await refresh(app, first.refresh_token)
      expect(replay.status).toBe(400)
      expect(await replay.json()).toMatchObject({ error: 'invalid_grant' })
      // The replay was treated as theft: the newest token of the family is dead too.
      expect((await refresh(app, second.refresh_token)).status).toBe(400)
    })

    it('revokes on request and ignores unknown tokens', async () => {
      const app = await createApp()
      const tokens = await signIn(app)
      const revoke = (token: string) => form('/oauth/revoke', { token }, { authorization: basic(app.clientId, app.clientSecret) })
      expect((await revoke(tokens.refresh_token)).status).toBe(200)
      expect((await revoke('unknown')).status).toBe(200)
      expect((await refresh(app, tokens.refresh_token)).status).toBe(400)
      expect((await form('/oauth/revoke', { token: 'x' }, { authorization: basic(app.clientId, 'wrong') })).status).toBe(401)
    })

    it('stops refreshing when the application is disabled, the secret replaced or everyone signed out', async () => {
      const app = await createApp()
      const tokens = await signIn(app)
      const admin = (method: string, path: string, body?: unknown) => json(staff.cookie, method, `/api/oauth-server/admin/applications/${app.id}${path}`, body)

      await ok(await admin('PATCH', '', { isActive: false }))
      const disabled = await refresh(app, tokens.refresh_token)
      expect(disabled.status).toBe(400)
      expect((await fetch(`/oauth/authorize?${authorizeQuery(app.clientId, pkce().challenge)}`, { headers: { cookie: staff.cookie }, redirect: 'manual' })).status).toBe(400)
      await ok(await admin('PATCH', '', { isActive: true }))

      const fresh = await signIn(app)
      const { clientSecret } = await ok(await admin('POST', '/secret'))
      expect((await refresh(app, fresh.refresh_token)).status).toBe(401) // old secret
      expect((await form('/oauth/token', { grant_type: 'refresh_token', refresh_token: fresh.refresh_token }, { authorization: basic(app.clientId, clientSecret) })).status).toBe(400) // revoked with the secret

      const again = await signIn({ ...app, clientSecret })
      await ok(await admin('POST', '/revoke'))
      expect((await form('/oauth/token', { grant_type: 'refresh_token', refresh_token: again.refresh_token }, { authorization: basic(app.clientId, clientSecret) })).status).toBe(400)
    })
  })

  describe('key rotation', () => {
    const accessToken = async (kid: string, pem: string, clientId: string, userId: number) => new SignJWT({ scope: 'openid email', client_id: clientId })
      .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid })
      .setIssuer('https://id.example.test')
      .setSubject(String(userId))
      .setAudience(clientId)
      .setExpirationTime('5m')
      .sign(await importPKCS8(pem, 'RS256'))
    const userinfo = (token: string) => fetch('/oauth/userinfo', { headers: { authorization: `Bearer ${token}` } })

    it('still accepts tokens signed by the retired key, and rejects unknown keys', async () => {
      const app = await createApp()
      staff ??= await user('Staff', 'staff.test')

      const old = await userinfo(await accessToken('key-0', retired.privateKey, app.clientId, staff.id))
      expect(old.status, await old.clone().text()).toBe(200)
      expect(await old.json()).toMatchObject({ sub: String(staff.id) })

      // Same kid, different key: the signature must not verify against the retired public key.
      const impostor = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
      expect((await userinfo(await accessToken('key-0', impostor.privateKey, app.clientId, staff.id))).status).toBe(401)
      expect((await userinfo(await accessToken('key-9', impostor.privateKey, app.clientId, staff.id))).status).toBe(401)
    })

    it('signs new tokens with the current key only', async () => {
      const app = await createApp()
      const { verifier, challenge } = pkce()
      const code = await authorizeCode(staff, app.clientId, challenge)
      const tokens = await (await tokenRequest(app, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier })).json() as Json
      expect(decodeProtectedHeader(tokens.id_token).kid).toBe('key-1')
      expect(decodeProtectedHeader(tokens.access_token).kid).toBe('key-1')
    })
  })

  describe('user helpers', () => {
    it('lists the applications a user may sign in to', async () => {
      const staffOnly = await createApp({ name: 'Staff only', allowedRoles: ['staff'], priority: 1 })
      const members = await createApp({ name: 'For members', allowedRoles: ['member'], loginUrl: 'https://app.example.com/start', priority: 9 })
      const everyone = await createApp({ name: 'Everyone', allowedRoles: [] })
      const disabled = await createApp({ name: 'Disabled', allowedRoles: [], isActive: false })

      const idsFor = async (session: Session) => (await ok(await json(session.cookie, 'GET', '/api/oauth-server/me/applications')) as unknown as Json[]).map(application => application.id)

      const member = await user('Member')
      const memberIds = await idsFor(member)
      expect(memberIds).toContain(members.id)
      expect(memberIds).toContain(everyone.id)
      expect(memberIds).not.toContain(staffOnly.id)
      expect(memberIds).not.toContain(disabled.id)

      const nobody = await user('Nobody', 'nobody.test')
      const nobodyIds = await idsFor(nobody)
      expect(nobodyIds).toContain(everyone.id)
      expect(nobodyIds).not.toContain(members.id)

      const staffList = await ok(await json(staff.cookie, 'GET', '/api/oauth-server/me/applications')) as unknown as Json[]
      expect(staffList.map(application => application.id)).toEqual(expect.arrayContaining([staffOnly.id, members.id, everyone.id]))
      // Highest priority first; `loginUrl` falls back to the website.
      expect(staffList.findIndex(a => a.id === members.id)).toBeLessThan(staffList.findIndex(a => a.id === staffOnly.id))
      expect(staffList.find(a => a.id === members.id)!.loginUrl).toBe('https://app.example.com/start')
      expect(staffList.find(a => a.id === everyone.id)!.loginUrl).toBe('https://app.example.com')
      expect(staffList[0]!.secretHash).toBeUndefined()

      expect((await json(undefined, 'GET', '/api/oauth-server/me/applications')).status).toBe(401)
    })
  })

  describe('API access with access tokens', () => {
    async function signIn(app: Json, scope: string) {
      const { verifier, challenge } = pkce()
      const code = await authorizeCode(staff, app.clientId, challenge, { scope })
      return await ok(await tokenRequest(app, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier })) as Json
    }
    const asBearer = (token: string) => ({ authorization: `Bearer ${token}` })

    it('lets an application call the API as the user, identifying both', async () => {
      const app = await createApp()
      const tokens = await signIn(app, 'openid groups')

      const me = await $fetch<Json>('/api/test/whoami', { headers: asBearer(tokens.access_token) })
      expect(me).toMatchObject({ kind: 'oauth', userId: staff.id, clientId: app.clientId })
      expect(me.scopes).toEqual(['openid', 'groups'])
    })

    it('limits the application to the scopes the user granted', async () => {
      const app = await createApp()
      const tokens = await signIn(app, 'openid email')
      const response = await fetch('/api/test/whoami', { headers: asBearer(tokens.access_token) })
      expect(response.status).toBe(403)
      expect((await response.json()).data).toMatchObject({ error: 'insufficient_scope' })
    })

    it('does not accept ID tokens or foreign tokens as credentials', async () => {
      const app = await createApp()
      const tokens = await signIn(app, 'openid groups')
      expect((await fetch('/api/test/whoami', { headers: asBearer(tokens.id_token) })).status).toBe(401)

      const impostor = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
      const forged = await new SignJWT({ scope: 'groups', client_id: app.clientId })
        .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'key-1' })
        .setIssuer('https://id.example.test')
        .setSubject(String(staff.id))
        .setAudience(app.clientId)
        .setExpirationTime('5m')
        .sign(await importPKCS8(impostor.privateKey, 'RS256'))
      expect((await fetch('/api/test/whoami', { headers: asBearer(forged) })).status).toBe(401)
    })

    it('keeps session-only routes closed to applications', async () => {
      const app = await createApp()
      const tokens = await signIn(app, 'openid groups')
      const response = await fetch('/api/test/session-only', { headers: asBearer(tokens.access_token) })
      expect(response.status).toBe(403)
      expect((await response.json()).data).toMatchObject({ error: 'session_required' })
      expect((await fetch('/api/test/session-only', { headers: { cookie: staff.cookie } })).status).toBe(200)
    })

    it('stops working the moment the application is disabled or loses access', async () => {
      const app = await createApp()
      const tokens = await signIn(app, 'openid groups')
      const call = () => fetch('/api/test/whoami', { headers: asBearer(tokens.access_token) })
      const admin = (body: unknown) => json(staff.cookie, 'PATCH', `/api/oauth-server/admin/applications/${app.id}`, body)
      expect((await call()).status).toBe(200)

      await ok(await admin({ isActive: false }))
      expect((await call()).status).toBe(401)
      await ok(await admin({ isActive: true }))
      expect((await call()).status).toBe(200)

      // The role requirement changed after the token was issued.
      await ok(await admin({ allowedRoles: ['nobody'] }))
      expect((await call()).status).toBe(401)
    })

    it('rejects a token whose application was deleted', async () => {
      const app = await createApp()
      const tokens = await signIn(app, 'openid groups')
      await ok(await json(staff.cookie, 'DELETE', `/api/oauth-server/admin/applications/${app.id}`))
      expect((await fetch('/api/test/whoami', { headers: asBearer(tokens.access_token) })).status).toBe(401)
    })

    it('never falls back to the session behind an invalid token', async () => {
      const response = await fetch('/api/test/whoami', { headers: { cookie: staff.cookie, authorization: 'Bearer aaa.bbb.ccc' } })
      expect(response.status).toBe(401)
    })
  })
})
