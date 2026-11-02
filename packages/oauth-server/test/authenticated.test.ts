import { fileURLToPath } from 'node:url'
import { generateKeyPairSync } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { SignJWT, createLocalJWKSet, decodeProtectedHeader, decodeJwt, importPKCS8, jwtVerify } from 'jose'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { oauthServerApi, oidc } from '../src/runtime/utils/api'
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

async function mcpRpc(cookie: string | undefined, method: string, params: Json = {}) {
  const response = await fetch('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await response.text()
  const payload = text.trimStart().startsWith('{') ? text : text.split('\n').find(line => line.startsWith('data:'))?.slice(5) ?? '{}'
  return JSON.parse(payload) as { result?: Json, error?: Json }
}

describe('oauth-server (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  const user = (name: string, domain = 'member.test') => registerUser(name, `${name.toLowerCase()}${++counter}@${domain}`)
  let staff: Session

  async function createApp(overrides: Json = {}) {
    staff ??= await user('Staff', 'staff.test')
    return ok(await json(staff.cookie, 'POST', oauthServerApi.admin.applications, {
      name: `App ${++counter}`,
      websiteUrl: 'https://app.example.com',
      allowedRoles: ['staff'],
      ...overrides,
    }))
  }

  /** Runs the whole flow up to the redirect with a code; returns the code (or the failing response). */
  async function authorizeCode(session: Session, clientId: string, challenge: string, extra: Record<string, string> = {}) {
    const query = authorizeQuery(clientId, challenge, extra)
    const entry = await fetch(`${oidc.authorize}?${query}`, { headers: { cookie: session.cookie }, redirect: 'manual' })
    expect(entry.status, await entry.clone().text()).toBe(302)
    expect(entry.headers.get('location')).toBe(`/authorize?${query}`)
    const decision = await ok(await json(session.cookie, 'POST', oidc.authorize, { ...Object.fromEntries(query), approved: true }))
    const url = new URL(decision.redirectUrl)
    expect(`${url.origin}${url.pathname}`).toBe(CALLBACK)
    expect(url.searchParams.get('state')).toBe('state-123')
    return url.searchParams.get('code')!
  }

  const tokenRequest = (app: Json, body: Record<string, string>) =>
    form(oidc.token, body, { authorization: basic(app.clientId, app.clientSecret) })

  describe('discovery', () => {
    it('serves the OIDC configuration and a public-only JWKS', async () => {
      const config = await $fetch<Json>(oidc.configuration)
      expect(config.issuer).toBe('https://id.example.test')
      expect(config.token_endpoint).toBe('https://id.example.test/oauth/token')
      expect(config.scopes_supported).toEqual(['openid', 'profile', 'email', 'groups', 'users:read', 'oauth:read'])
      expect(config.code_challenge_methods_supported).toEqual(['S256'])
      expect(config.token_endpoint_auth_methods_supported).toEqual(['client_secret_basic', 'client_secret_post', 'none'])

      const jwks = await $fetch<Json>(oidc.jwks)
      expect(jwks.keys).toHaveLength(2) // the current key and the retired one, see the rotation tests
      expect(jwks.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig', kid: 'key-1' })
      expect(jwks.keys[0].d).toBeUndefined()
    })

    it('keeps publishing the previous key while rotating', async () => {
      const jwks = await $fetch<Json>(oidc.jwks)
      expect(jwks.keys.map((key: Json) => key.kid)).toEqual(['key-1', 'key-0'])
      for (const key of jwks.keys) expect(key.d).toBeUndefined()
    })
  })

  describe('admin gate and application management', () => {
    it('denies by default: anonymous 401, non-staff 403', async () => {
      expect((await json(undefined, 'GET', oauthServerApi.admin.applications)).status).toBe(401)
      const member = await user('Member')
      expect((await json(member.cookie, 'GET', oauthServerApi.admin.applications)).status).toBe(403)
      expect((await json(member.cookie, 'POST', oauthServerApi.admin.applications, { name: 'x', websiteUrl: 'https://x.test' })).status).toBe(403)
    })

    it('validates input', async () => {
      staff ??= await user('Staff', 'staff.test')
      const post = (body: Json) => json(staff.cookie, 'POST', oauthServerApi.admin.applications, body)
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

      const api = apiClient({ cookie: staff.cookie })
      const list = await api.json<Json>('GET', `${oauthServerApi.admin.applications}?q=${created.id}`)
      expect(list).toMatchObject({ total: 1, page: 1, pageSize: 20 })
      const listed = list.items[0]
      expect(listed.id).toBe(created.id)
      expect(listed.callbackUrl).toBe(CALLBACK)
      expect(listed.activeGrants).toBe(0)
      expect(listed.secretHash).toBeUndefined()
      expect(listed.clientSecret).toBeUndefined()

      const detail = await api.json<Json>('GET', oauthServerApi.admin.application(created.id))
      expect(detail).toMatchObject({ id: created.id, callbackUrl: CALLBACK, activeGrants: 0 })
      expect(detail.createdAt).toBe(new Date(detail.createdAt).toISOString())

      const edited = await api.json<Json>('PATCH', oauthServerApi.admin.application(created.id), { name: 'Renamed', priority: 5 })
      expect(edited).toMatchObject({ name: 'Renamed', priority: 5, websiteUrl: 'https://app.example.com', callbackUrl: CALLBACK })

      const deleted = await api.fetch('DELETE', oauthServerApi.admin.application(created.id))
      expect(deleted.status).toBe(204)
      expect(await deleted.text()).toBe('')
      await expectApiError(api.json('GET', oauthServerApi.admin.application(created.id)), 404, 'not_found')
      await expectApiError(api.json('DELETE', oauthServerApi.admin.application(created.id)), 404, 'not_found')
      await expectApiError(api.json('POST', oauthServerApi.admin.revoke(created.id)), 404, 'not_found')
      await expectApiError(api.json('POST', oauthServerApi.admin.rotateSecret(created.id)), 404, 'not_found')
    })

    it('pages, searches and sorts the list', async () => {
      const tag = `page${++counter}`
      const apps = [] as Json[]
      for (const name of ['Charlie', 'Alpha', 'Bravo']) apps.push(await createApp({ name: `${tag} ${name}` }))
      const api = apiClient({ cookie: staff.cookie })
      const list = (query: Record<string, string>) => api.json<Json>('GET', `${oauthServerApi.admin.applications}?${new URLSearchParams(query)}`)

      const first = await list({ q: tag, pageSize: '2', sort: 'name', order: 'asc' })
      expect(first).toMatchObject({ total: 3, page: 1, pageSize: 2 })
      expect(first.items.map((item: Json) => item.name)).toEqual([`${tag} Alpha`, `${tag} Bravo`])
      const second = await list({ q: tag, pageSize: '2', page: '2', sort: 'name', order: 'asc' })
      expect(second.items.map((item: Json) => item.name)).toEqual([`${tag} Charlie`])

      // The client id is searchable too, and wildcards are literal.
      expect((await list({ q: apps[1]!.id })).items.map((item: Json) => item.id)).toEqual([apps[1]!.id])
      expect((await list({ q: `${tag}%` })).total).toBe(0)

      await expectApiError(list({ sort: 'secretHash' }), 400)
      await expectApiError(list({ pageSize: '500' }), 400)
    })

    it('rejects malformed ids and bodies with the standard errors', async () => {
      staff ??= await user('Staff', 'staff.test')
      const api = apiClient({ cookie: staff.cookie })
      await expectApiError(api.json('GET', oauthServerApi.admin.application('app_unknown')), 404, 'not_found')
      await expectApiError(api.json('PATCH', oauthServerApi.admin.application('app_unknown'), { name: 'x' }), 404, 'not_found')
      const created = await createApp()
      await expectApiError(api.json('PATCH', oauthServerApi.admin.application(created.id), { priority: 'high' }), 400)
      await expectApiError(api.json('PATCH', oauthServerApi.admin.application(created.id), { clientType: 'public' }), 400, 'bad_request')
      // Who may: anonymous 401, members 403 with a code, before anything is looked up.
      await expectApiError(apiClient().json('POST', oauthServerApi.admin.revoke('app_unknown')), 401)
      const member = await user('Member')
      await expectApiError(apiClient({ cookie: member.cookie }).json('POST', oauthServerApi.admin.revoke(created.id)), 403, 'forbidden')
      await expectApiError(apiClient({ cookie: member.cookie }).json('GET', oauthServerApi.admin.application('app_unknown')), 403, 'forbidden')
    })

    it('renders the admin page with a row menu per application', async () => {
      const created = await createApp({ name: 'Menu app' })
      const response = await fetch('/admin/oauth', { headers: { cookie: staff.cookie } })
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('OAuth applications')
      expect(html).toContain('Add application')
      // The row menu trigger is labelled with the application it acts on.
      expect(html).toContain('aria-label="Actions for Menu app"')
      await ok(await json(staff.cookie, 'DELETE', oauthServerApi.admin.application(created.id)))
      // The first render compiles the page in dev mode.
    }, 120_000)
  })

  describe('authorization code flow with PKCE', () => {
    it('rejects invalid requests before anything is redirected', async () => {
      const app = await createApp()
      const { challenge } = pkce()
      const get = (query: URLSearchParams) => fetch(`${oidc.authorize}?${query}`, { redirect: 'manual' })
      expect((await get(authorizeQuery(app.clientId, challenge, { redirect_uri: 'https://evil.example.com/auth/frigear' }))).status).toBe(400)
      expect((await get(authorizeQuery('app_unknown', challenge))).status).toBe(400)
      const plain = await get(authorizeQuery(app.clientId, challenge, { code_challenge_method: 'plain' }))
      expect(plain.status).toBe(400)
      expect(await plain.text()).toContain('Invalid authorization request: code_challenge_method')
      const consent = await json(staff.cookie, 'GET', `${oauthServerApi.consent}?${authorizeQuery(app.clientId, challenge, { response_type: 'token' })}`)
      expect(consent.status).toBe(400)
      expect((await consent.json() as Json).statusMessage).toContain('Invalid authorization request: response_type')
      expect((await get(authorizeQuery(app.clientId, challenge, { scope: 'nope' }))).status).toBe(400)
    })

    it('sends anonymous users to the login page and back', async () => {
      const app = await createApp()
      const query = authorizeQuery(app.clientId, pkce().challenge)
      const response = await fetch(`${oidc.authorize}?${query}`, { redirect: 'manual' })
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe(`/login?redirect=${encodeURIComponent(`${oidc.authorize}?${query}`)}`)
    })

    it('checks the role of the user', async () => {
      const app = await createApp({ allowedRoles: ['staff'] })
      const member = await user('Member')
      const nobody = await user('Nobody', 'nobody.test')
      const query = authorizeQuery(app.clientId, pkce().challenge)

      for (const denied of [member, nobody]) {
        const response = await fetch(`${oidc.authorize}?${query}`, { headers: { cookie: denied.cookie }, redirect: 'manual' })
        expect(response.status).toBe(403)
        // The consent page and the approval enforce it too, not just the entry point.
        expect((await json(denied.cookie, 'GET', `${oauthServerApi.consent}?${query}`)).status).toBe(403)
        expect((await json(denied.cookie, 'POST', oidc.authorize, { ...Object.fromEntries(query), approved: true })).status).toBe(403)
      }
      expect((await fetch(`${oidc.authorize}?${query}`, { headers: { cookie: staff.cookie }, redirect: 'manual' })).status).toBe(302)
    })

    it('lets everyone in when no roles are required, unless the host vetoes', async () => {
      const app = await createApp({ allowedRoles: [] })
      const nobody = await user('Nobody', 'nobody.test')
      const query = authorizeQuery(app.clientId, pkce().challenge)
      expect((await fetch(`${oidc.authorize}?${query}`, { headers: { cookie: nobody.cookie }, redirect: 'manual' })).status).toBe(302)

      const blocked = await registerUser('Blocked', `blocked${++counter}@member.test`)
      const response = await fetch(`${oidc.authorize}?${query}`, { headers: { cookie: blocked.cookie }, redirect: 'manual' })
      expect(response.status).toBe(403)
      expect(await response.text()).toContain('Blocked by policy.')
    })

    it('shows the consent data with only supported scopes', async () => {
      const app = await createApp()
      const query = authorizeQuery(app.clientId, pkce().challenge, { scope: 'openid email unknown' })
      const consent = await ok(await json(staff.cookie, 'GET', `${oauthServerApi.consent}?${query}`))
      expect(consent.application).toMatchObject({ id: app.clientId, name: app.name })
      expect(consent.scope).toEqual(['openid', 'email'])
      expect((await json(undefined, 'GET', `${oauthServerApi.consent}?${query}`)).status).toBe(401)
    })

    it('describes the requested scopes for the consent screen', async () => {
      const app = await createApp()
      const query = authorizeQuery(app.clientId, pkce().challenge, { scope: 'openid groups oauth:read' })
      const consent = await ok(await json(staff.cookie, 'GET', `${oauthServerApi.consent}?${query}`))
      expect(consent.scopes).toEqual([
        { name: 'openid' },
        // Configured details win; a scope registered with `addAuthScope` shows its description as the label.
        { name: 'groups', label: 'Your groups', description: 'Which groups you belong to', icon: 'i-lucide-users' },
        { name: 'oauth:read', label: 'See which applications you can sign in to (MCP)' },
      ])
    })

    it('grants a staff-only scope to staff and silently drops it for everyone else', async () => {
      const app = await createApp({ allowedRoles: [] })
      const member = await user('Plain')
      staff ??= await user('Staff', 'staff.test')
      const tokensFor = async (session: Session) => {
        const { verifier, challenge } = pkce()
        const query = authorizeQuery(app.clientId, challenge, { scope: 'openid users:read' })
        const consent = await ok(await json(session.cookie, 'GET', `${oauthServerApi.consent}?${query}`))
        const code = await authorizeCode(session, app.clientId, challenge, { scope: 'openid users:read' })
        const tokens = await ok(await tokenRequest(app, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier }))
        return { consent, tokens }
      }
      const bearer = (token: string) => fetch('/api/admin/users', { headers: { authorization: `Bearer ${token}` } })

      const plain = await tokensFor(member)
      expect(plain.consent.scope).toEqual(['openid'])
      expect(plain.tokens.scope).toBe('openid')
      const refused = await bearer(plain.tokens.access_token)
      expect(refused.status).toBe(403)
      expect(await refused.json()).toMatchObject({ data: { code: 'insufficient_scope' } })

      const granted = await tokensFor(staff)
      expect(granted.consent.scope).toEqual(['openid', 'users:read'])
      expect(granted.tokens.scope).toBe('openid users:read')
      const list = await bearer(granted.tokens.access_token)
      expect(list.status, await list.clone().text()).toBe(200)
      expect((await list.json() as Json).items.length).toBeGreaterThan(0)
      // Reading is all the scope opens up: changes still need a session.
      const patch = await fetch(`/api/admin/users/${member.id}`, {
        method: 'PATCH',
        headers: { 'authorization': `Bearer ${granted.tokens.access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      })
      expect(patch.status).toBe(403)
      expect(await patch.json()).toMatchObject({ data: { code: 'session_required' } })
    })

    it('returns access_denied to the application when the user declines', async () => {
      const app = await createApp()
      const query = authorizeQuery(app.clientId, pkce().challenge)
      const { redirectUrl } = await ok(await json(staff.cookie, 'POST', oidc.authorize, { ...Object.fromEntries(query), approved: false }))
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
      const bad = await form(oidc.token, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier }, { authorization: basic(app.clientId, 'wrong') })
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

      const jwks = createLocalJWKSet(await $fetch<Json>(oidc.jwks) as never)
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

      const userinfo = await $fetch<Json>(oidc.userinfo, { headers: { authorization: `Bearer ${tokens.access_token}` } })
      expect(userinfo).toMatchObject({ sub: String(staff.id), email: expect.stringMatching(/@staff\.test$/), role: 'staff' })
      expect(userinfo.name).toBeUndefined()

      expect((await fetch(oidc.userinfo)).status).toBe(401)
      expect((await fetch(oidc.userinfo, { headers: { authorization: `Bearer ${tokens.id_token}` } })).status).toBe(401)
      expect((await fetch(oidc.userinfo, { headers: { authorization: 'Bearer garbage' } })).status).toBe(401)
    })

    it('accepts client credentials in the body too', async () => {
      const app = await createApp()
      const { verifier, challenge } = pkce()
      const code = await authorizeCode(staff, app.clientId, challenge)
      const response = await form(oidc.token, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier, client_id: app.clientId, client_secret: app.clientSecret })
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
      const revoke = (token: string) => form(oidc.revoke, { token }, { authorization: basic(app.clientId, app.clientSecret) })
      expect((await revoke(tokens.refresh_token)).status).toBe(200)
      expect((await revoke('unknown')).status).toBe(200)
      expect((await refresh(app, tokens.refresh_token)).status).toBe(400)
      expect((await form(oidc.revoke, { token: 'x' }, { authorization: basic(app.clientId, 'wrong') })).status).toBe(401)
    })

    it('answers malformed token and revocation bodies with the RFC 6749 error, not the validation error', async () => {
      const app = await createApp()
      const auth = { authorization: basic(app.clientId, app.clientSecret) }
      const send = (path: string, body: string, contentType = 'application/json') => fetch(path, {
        method: 'POST',
        headers: { 'content-type': contentType, ...auth },
        body,
      })
      for (const path of [oidc.token, oidc.revoke]) {
        for (const response of [
          await send(path, JSON.stringify({ grant_type: 'refresh_token', refresh_token: 42, token: ['a'] })),
          await send(path, '{ not json'),
          await send(path, new URLSearchParams([['token', 'a'], ['token', 'b'], ['grant_type', 'x'], ['grant_type', 'y']]).toString(), 'application/x-www-form-urlencoded'),
        ]) {
          expect(response.status, path).toBe(400)
          expect(response.headers.get('cache-control')).toBe('no-store')
          const body = await response.json() as Json
          expect(Object.keys(body).sort(), path).toEqual(['error', 'error_description'])
          expect(body.error).toBe('invalid_request')
          expect(typeof body.error_description).toBe('string')
        }
      }
      // A well-formed body without the grant's fields is still the grant's own invalid_request.
      const missing = await tokenRequest(app, { grant_type: 'refresh_token' })
      expect(missing.status).toBe(400)
      expect(await missing.json()).toEqual({ error: 'invalid_request', error_description: 'refresh_token is required.' })
    })

    it('stops refreshing when the application is disabled, the secret replaced or everyone signed out', async () => {
      const app = await createApp()
      const tokens = await signIn(app)
      const admin = (method: string, path: string, body?: unknown) => json(staff.cookie, method, `${oauthServerApi.admin.application(app.id)}${path}`, body)

      await ok(await admin('PATCH', '', { isActive: false }))
      const disabled = await refresh(app, tokens.refresh_token)
      expect(disabled.status).toBe(400)
      expect((await fetch(`${oidc.authorize}?${authorizeQuery(app.clientId, pkce().challenge)}`, { headers: { cookie: staff.cookie }, redirect: 'manual' })).status).toBe(400)
      await ok(await admin('PATCH', '', { isActive: true }))

      const fresh = await signIn(app)
      const { clientSecret } = await apiClient({ cookie: staff.cookie }).json<Json>('POST', oauthServerApi.admin.rotateSecret(app.id))
      expect((await refresh(app, fresh.refresh_token)).status).toBe(401) // old secret
      expect((await form(oidc.token, { grant_type: 'refresh_token', refresh_token: fresh.refresh_token }, { authorization: basic(app.clientId, clientSecret) })).status).toBe(400) // revoked with the secret

      const again = await signIn({ ...app, clientSecret })
      const before = await apiClient({ cookie: staff.cookie }).json<Json>('GET', oauthServerApi.admin.application(app.id))
      expect(before.activeGrants).toBeGreaterThan(0)
      // Signing everyone out answers the application, now with nobody signed in.
      const revoked = await apiClient({ cookie: staff.cookie }).json<Json>('POST', oauthServerApi.admin.revoke(app.id))
      expect(revoked).toMatchObject({ id: app.id, name: app.name, activeGrants: 0, callbackUrl: CALLBACK })
      expect(revoked.secretHash).toBeUndefined()
      expect((await form(oidc.token, { grant_type: 'refresh_token', refresh_token: again.refresh_token }, { authorization: basic(app.clientId, clientSecret) })).status).toBe(400)
    })
  })

  describe('public clients (native apps and single-page apps)', () => {
    const NATIVE = 'com.example.app:/callback'
    const WEBVIEW = 'capacitor://localhost/auth/callback'
    const publicApp = (overrides: Json = {}) => createApp({ clientType: 'public', redirectUris: [NATIVE, WEBVIEW], ...overrides })

    /** Approves an authorization request and returns the code the app receives on its redirect URI. */
    async function nativeCode(app: Json, challenge: string, redirectUri = NATIVE, extra: Record<string, string> = {}) {
      const query = authorizeQuery(app.clientId, challenge, { redirect_uri: redirectUri, ...extra })
      const response = await json(staff.cookie, 'POST', oidc.authorize, { ...Object.fromEntries(query), approved: true })
      const decision = await ok(response)
      const redirect = new URL(decision.redirectUrl)
      expect(redirect.protocol + redirect.pathname).toBe(new URL(redirectUri).protocol + new URL(redirectUri).pathname)
      expect(redirect.searchParams.get('state')).toBe('state-123')
      return redirect.searchParams.get('code')!
    }

    /** A public client identifies itself with `client_id` only. */
    const publicToken = (app: Json, body: Record<string, string>) => form(oidc.token, { client_id: app.clientId, ...body })

    async function signIn(app: Json, redirectUri = NATIVE, scope?: string) {
      const { verifier, challenge } = pkce()
      const code = await nativeCode(app, challenge, redirectUri, scope ? { scope } : {})
      return await ok(await publicToken(app, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier })) as Json
    }

    it('registers without a secret, shows it as public, and has nothing to rotate', async () => {
      const app = await publicApp()
      expect(app).toMatchObject({ clientType: 'public', clientSecret: null, redirectUris: [NATIVE, WEBVIEW] })
      expect(app.secretHash).toBeUndefined()

      const list = await apiClient({ cookie: staff.cookie }).json<Json>('GET', `${oauthServerApi.admin.applications}?q=${app.id}`)
      expect(list.items).toEqual([expect.objectContaining({ id: app.id, clientType: 'public' })])

      const rotate = await json(staff.cookie, 'POST', oauthServerApi.admin.rotateSecret(app.id))
      expect(rotate.status).toBe(400)
    })

    it('defaults to confidential, with a secret, and keeps the type fixed', async () => {
      const confidential = await createApp()
      expect(confidential).toMatchObject({ clientType: 'confidential' })
      expect(confidential.clientSecret).toHaveLength(64)

      const patch = (id: string, body: Json) => json(staff.cookie, 'PATCH', oauthServerApi.admin.application(id), body)
      expect((await patch(confidential.id, { clientType: 'public' })).status).toBe(400)
      const pub = await publicApp()
      expect((await patch(pub.id, { clientType: 'confidential' })).status).toBe(400)
      // Sending the unchanged type, as the admin form does, is fine.
      expect(await ok(await patch(pub.id, { clientType: 'public', name: 'Renamed' }))).toMatchObject({ name: 'Renamed', clientType: 'public' })
    })

    it('limits native redirect URIs to public clients and refuses dangerous schemes', async () => {
      staff ??= await user('Staff', 'staff.test')
      const post = (body: Json) => json(staff.cookie, 'POST', oauthServerApi.admin.applications, { name: 'x', websiteUrl: 'https://app.example.com', ...body })
      expect((await post({ redirectUris: [NATIVE] })).status).toBe(400) // confidential
      expect((await post({ clientType: 'confidential', redirectUris: [WEBVIEW] })).status).toBe(400)
      for (const uri of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'com.example.*:/cb', 'com.example.app:/cb#frag', 'http://app.example.com/cb']) {
        expect((await post({ clientType: 'public', redirectUris: [uri] })).status, uri).toBe(400)
      }
      expect((await post({ clientType: 'public', redirectUris: ['https://app.example.com/cb', 'http://localhost:3000/cb'] })).status).toBe(201)

      const confidential = await createApp()
      const patch = await json(staff.cookie, 'PATCH', oauthServerApi.admin.application(confidential.id), { redirectUris: [NATIVE] })
      expect(patch.status).toBe(400)
      const pub = await publicApp()
      expect(await ok(await json(staff.cookie, 'PATCH', oauthServerApi.admin.application(pub.id), { redirectUris: [NATIVE, 'com.example.other:/cb'] })))
        .toMatchObject({ redirectUris: [NATIVE, 'com.example.other:/cb'] })
    })

    it('only redirects to registered native URIs, and still requires PKCE', async () => {
      const app = await publicApp()
      const { challenge } = pkce()
      for (const uri of ['com.example.app:/other', 'com.example.app:/callback/extra', 'com.evil.app:/callback', 'https://evil.example.com/cb']) {
        const response = await json(staff.cookie, 'POST', oidc.authorize, { ...Object.fromEntries(authorizeQuery(app.clientId, challenge, { redirect_uri: uri })), approved: true })
        expect(response.status, uri).toBe(400)
      }
      const noChallenge = await json(staff.cookie, 'POST', oidc.authorize, { client_id: app.clientId, redirect_uri: NATIVE, response_type: 'code', state: 'state-123', approved: true })
      expect(noChallenge.status).toBe(400)
      const plain = await json(staff.cookie, 'POST', oidc.authorize, { ...Object.fromEntries(authorizeQuery(app.clientId, challenge, { code_challenge_method: 'plain' })), redirect_uri: NATIVE, approved: true })
      expect(plain.status).toBe(400)
    })

    it('exchanges the code with PKCE and no secret, and the token calls the API', async () => {
      const app = await publicApp()
      const tokens = await signIn(app, WEBVIEW, 'openid groups')
      expect(tokens).toMatchObject({ token_type: 'Bearer' })
      expect(tokens.refresh_token).toBeTypeOf('string')

      const me = await $fetch<Json>('/api/test/whoami', { headers: { authorization: `Bearer ${tokens.access_token}` } })
      expect(me).toMatchObject({ kind: 'oauth', userId: staff.id, clientId: app.clientId })
    })

    it('rejects a wrong verifier, a replayed code, and a different redirect_uri', async () => {
      const app = await publicApp()
      const { verifier, challenge } = pkce()

      const code = await nativeCode(app, challenge)
      const wrong = await publicToken(app, { grant_type: 'authorization_code', code, redirect_uri: NATIVE, code_verifier: pkce().verifier })
      expect(wrong.status).toBe(400)
      expect(await wrong.json()).toMatchObject({ error: 'invalid_grant' })
      // The code is burned by the failed attempt.
      expect((await publicToken(app, { grant_type: 'authorization_code', code, redirect_uri: NATIVE, code_verifier: verifier })).status).toBe(400)

      const other = await nativeCode(app, challenge)
      expect((await publicToken(app, { grant_type: 'authorization_code', code: other, redirect_uri: WEBVIEW, code_verifier: verifier })).status).toBe(400)

      const missing = await publicToken(app, { grant_type: 'authorization_code', code: await nativeCode(app, challenge), redirect_uri: NATIVE })
      expect(missing.status).toBe(400)
      expect(await missing.json()).toMatchObject({ error: 'invalid_request' })
    })

    it('does not accept a code issued to another client', async () => {
      const app = await publicApp()
      const intruder = await publicApp()
      const { verifier, challenge } = pkce()
      const code = await nativeCode(app, challenge)
      expect((await publicToken(intruder, { grant_type: 'authorization_code', code, redirect_uri: NATIVE, code_verifier: verifier })).status).toBe(400)
    })

    it('identifies clients correctly: no secret for public, never without one for confidential', async () => {
      const app = await publicApp()
      const { verifier, challenge } = pkce()
      const body = async () => ({ grant_type: 'authorization_code', code: await nativeCode(app, challenge), redirect_uri: NATIVE, code_verifier: verifier })

      // A secret sent to a public client is a misconfiguration: refused, not silently ignored.
      expect((await publicToken(app, { ...await body(), client_secret: 'anything' })).status).toBe(401)
      expect((await form(oidc.token, await body(), { authorization: basic(app.clientId, 'anything') })).status).toBe(401)
      // An empty secret (some libraries always send the field) and HTTP Basic without one are fine.
      expect((await publicToken(app, { ...await body(), client_secret: '' })).status).toBe(200)
      expect((await form(oidc.token, await body(), { authorization: basic(app.clientId, '') })).status).toBe(200)
      // No client at all.
      expect((await form(oidc.token, await body())).status).toBe(401)
      expect((await form(oidc.token, { ...await body(), client_id: 'app_unknown' })).status).toBe(401)

      // The same request with only a client_id fails for a confidential client.
      const confidential = await createApp()
      const code = await authorizeCode(staff, confidential.clientId, challenge)
      const response = await form(oidc.token, { client_id: confidential.clientId, grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier })
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({ error: 'invalid_client' })
    })

    it('rotates refresh tokens without a secret, and a replay revokes the family', async () => {
      const app = await publicApp()
      const first = await signIn(app)
      const refresh = (token: string, client = app) => publicToken(client, { grant_type: 'refresh_token', refresh_token: token })

      const second = await ok(await refresh(first.refresh_token))
      expect(second.refresh_token).not.toBe(first.refresh_token)
      expect(second.access_token).toBeTypeOf('string')

      expect((await refresh(first.refresh_token)).status).toBe(400)
      expect((await refresh(second.refresh_token)).status).toBe(400) // theft response: the family is dead
    })

    it('binds refresh tokens and revocation to the client they were issued to', async () => {
      const app = await publicApp()
      const other = await publicApp()
      const tokens = await signIn(app)

      // Another public client knows nothing more than a client_id, so it must not be able to use or kill the token.
      expect((await publicToken(other, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).status).toBe(400)
      await ok(await form(oidc.revoke, { client_id: other.clientId, token: tokens.refresh_token }))
      const stillWorks = await publicToken(app, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })
      expect(stillWorks.status, await stillWorks.clone().text()).toBe(200)
    })

    it('revokes on request without a secret', async () => {
      const app = await publicApp()
      const tokens = await signIn(app)
      await ok(await form(oidc.revoke, { client_id: app.clientId, token: tokens.refresh_token }))
      expect((await publicToken(app, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).status).toBe(400)

      expect((await form(oidc.revoke, { token: 'x' })).status).toBe(401)
      expect((await form(oidc.revoke, { client_id: app.clientId, client_secret: 'x', token: 'x' })).status).toBe(401)
      const confidential = await createApp()
      expect((await form(oidc.revoke, { client_id: confidential.clientId, token: 'x' })).status).toBe(401)
    })

    it('stops when the application is disabled', async () => {
      const app = await publicApp()
      const tokens = await signIn(app)
      await ok(await json(staff.cookie, 'PATCH', oauthServerApi.admin.application(app.id), { isActive: false }))
      expect((await publicToken(app, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).status).toBe(400)
      const { challenge } = pkce()
      const response = await json(staff.cookie, 'POST', oidc.authorize, { ...Object.fromEntries(authorizeQuery(app.clientId, challenge, { redirect_uri: NATIVE })), approved: true })
      expect(response.status).toBe(400)
    })
  })

  describe('CORS for browser clients on other origins', () => {
    const ALLOWED = 'capacitor://localhost'
    const preflight = (path: string, origin: string, method = 'POST') => fetch(path, {
      method: 'OPTIONS',
      headers: { 'origin': origin, 'access-control-request-method': method, 'access-control-request-headers': 'authorization, content-type' },
    })

    it('answers preflights of the token, revoke, userinfo and discovery endpoints for configured origins only', async () => {
      for (const [path, method] of [[oidc.token, 'POST'], [oidc.revoke, 'POST'], [oidc.userinfo, 'GET'], [oidc.configuration, 'GET'], [oidc.jwks, 'GET']] as const) {
        const response = await preflight(path, ALLOWED, method)
        expect(response.status, path).toBe(204)
        expect(response.headers.get('access-control-allow-origin'), path).toBe(ALLOWED)
        expect(response.headers.get('access-control-allow-methods'), path).toContain(method)
        expect(response.headers.get('access-control-allow-headers'), path).toContain('authorization')
        expect(response.headers.get('vary'), path).toContain('Origin')
        expect(response.headers.get('access-control-allow-credentials'), path).toBeNull()
      }
      expect((await preflight(oidc.token, 'https://app.example.com')).headers.get('access-control-allow-origin')).toBe('https://app.example.com')
    })

    it('gives other origins nothing, and never uses a wildcard', async () => {
      for (const origin of ['https://evil.example.com', 'capacitor://localhost.evil.com', 'http://capacitor://localhost', 'null', '*']) {
        const response = await preflight(oidc.token, origin)
        expect(response.headers.get('access-control-allow-origin'), origin).toBeNull()
        expect(response.headers.get('access-control-allow-methods'), origin).toBeNull()
        expect(response.status, origin).not.toBe(204)
      }
    })

    it('adds the headers to real responses, and varies on Origin even without one', async () => {
      const app = await createApp()
      const response = await form(oidc.token, { grant_type: 'refresh_token', refresh_token: 'x' }, { authorization: basic(app.clientId, app.clientSecret), origin: ALLOWED })
      expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED)

      const discovery = await fetch(oidc.configuration, { headers: { origin: ALLOWED } })
      expect(discovery.headers.get('access-control-allow-origin')).toBe(ALLOWED)
      const plain = await fetch(oidc.configuration)
      expect(plain.headers.get('access-control-allow-origin')).toBeNull()
      expect(plain.headers.get('vary')).toContain('Origin')
    })

    it('does not open up the authorization endpoint or anything else', async () => {
      const authorize = await fetch(`${oidc.authorize}?${authorizeQuery('app_x', pkce().challenge)}`, { headers: { origin: ALLOWED }, redirect: 'manual' })
      expect(authorize.headers.get('access-control-allow-origin')).toBeNull()
      const consent = await preflight(oidc.authorize, ALLOWED)
      expect(consent.headers.get('access-control-allow-origin')).toBeNull()
      const admin = await preflight(oauthServerApi.admin.applications, ALLOWED, 'GET')
      expect(admin.headers.get('access-control-allow-origin')).toBeNull()
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
    const userinfo = (token: string) => fetch(oidc.userinfo, { headers: { authorization: `Bearer ${token}` } })

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

      const idsFor = async (session: Session) => (await ok(await json(session.cookie, 'GET', oauthServerApi.me.applications)) as unknown as Json[]).map(application => application.id)

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

      const staffList = await ok(await json(staff.cookie, 'GET', oauthServerApi.me.applications)) as unknown as Json[]
      expect(staffList.map(application => application.id)).toEqual(expect.arrayContaining([staffOnly.id, members.id, everyone.id]))
      // Highest priority first; `loginUrl` falls back to the website.
      expect(staffList.findIndex(a => a.id === members.id)).toBeLessThan(staffList.findIndex(a => a.id === staffOnly.id))
      expect(staffList.find(a => a.id === members.id)!.loginUrl).toBe('https://app.example.com/start')
      expect(staffList.find(a => a.id === everyone.id)!.loginUrl).toBe('https://app.example.com')
      expect(staffList[0]!.secretHash).toBeUndefined()

      expect((await json(undefined, 'GET', oauthServerApi.me.applications)).status).toBe(401)
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
      const admin = (body: unknown) => json(staff.cookie, 'PATCH', oauthServerApi.admin.application(app.id), body)
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
      await ok(await json(staff.cookie, 'DELETE', oauthServerApi.admin.application(app.id)))
      expect((await fetch('/api/test/whoami', { headers: asBearer(tokens.access_token) })).status).toBe(401)
    })

    it('never falls back to the session behind an invalid token', async () => {
      const response = await fetch('/api/test/whoami', { headers: { cookie: staff.cookie, authorization: 'Bearer aaa.bbb.ccc' } })
      expect(response.status).toBe(401)
    })
  })

  describe('MCP tools', () => {
    it('only exposes my-oauth-applications to signed-in users, and never client secrets', async () => {
      expect((await mcpRpc(undefined, 'tools/list')).result?.tools ?? []).toEqual([])

      const user = await registerUser('Ada', 'mcp-ada@example.com')
      const mcpNames = (await mcpRpc(user.cookie, 'tools/list')).result?.tools.map((tool: { name: string }) => tool.name)
      expect(mcpNames).toEqual(['my-oauth-applications'])

      const result = await mcpRpc(user.cookie, 'tools/call', { name: 'my-oauth-applications', arguments: {} })
      expect(result.result?.isError, JSON.stringify(result)).toBeFalsy()
      expect(JSON.stringify(result)).not.toMatch(/secret|redirectUris/i)
    })
  })
})
