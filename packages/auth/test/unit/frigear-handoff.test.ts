import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../../src/runtime/db/schema.sqlite'
import { challengeFor } from '../../src/runtime/client/core/pkce'

// The browser handoff of "Log in with frigear.nu": the attempt lifecycle on an in-memory SQLite (real queries), and
// the browser callback with the issuer and the user sync stubbed.
const client = createClient({ url: ':memory:' })
const db = drizzle(client, { schema })
vi.mock('@nuxthub/db', () => ({ db, schema }))
// Nuxt's `deriveSecret` (from `appSecret`), which keys the stored PKCE verifiers.
let appSecret = 'a-test-only-app-secret'
vi.mock('nuxt/server', () => ({ deriveSecret: async (purpose: string) => `${appSecret}:${purpose}` }))

let query: Record<string, string> = {}
const fetchCalls: Array<{ url: string, options: { body?: string, headers?: Record<string, string> } }> = []
let tokenResponse: Record<string, unknown> = { id_token: 'id', access_token: 'access' }
let loginResult: unknown = { user: { id: 7 }, session: { frigear: { id: '7' } } }
const resolveFrigearLogin = vi.fn(async () => loginResult)
const responseStatus = vi.fn()
// Nitro's, used by the discovery cache of `frigear-sso` (reached through the token encryption of `oauth-tokens`).
vi.stubGlobal('cachedFunction', <T>(fn: T) => fn)
vi.stubGlobal('getQuery', () => query)
vi.stubGlobal('getRequestHeader', () => undefined)
vi.stubGlobal('setResponseStatus', responseStatus)
vi.stubGlobal('setResponseHeader', () => {})
vi.stubGlobal('loadOAuthOpenIdConfiguration', async () => ({ authorization_endpoint: 'https://issuer.example/oauth/authorize', token_endpoint: 'https://issuer.example/oauth/token' }))
vi.stubGlobal('$fetch', async (url: string, options: { body?: string }) => {
  fetchCalls.push({ url, options })
  return tokenResponse
})
vi.stubGlobal('resolveFrigearLogin', resolveFrigearLogin)

const handoff = await import('../../src/runtime/server/utils/frigear-handoff')
const { openFrigearHandoffVerifier, insertFrigearHandoff, findFrigearHandoff, beginFrigearHandoffCallback, finishFrigearHandoff, takeFrigearHandoff,
  removeFrigearHandoff, frigearHandoffStatusOf, isFrigearHandoffState, buildFrigearHandoffAuthorizeUrl,
  handleFrigearHandoffCallback, safeFrigearHandoffReturnUrl, FRIGEAR_HANDOFF_TTL_SECONDS } = handoff

const sso = { clientId: 'desktop', clientSecret: '', openidConfig: 'https://issuer.example/.well-known/openid-configuration', handoff: { enabled: true, returnUrl: '' } } as never
const event = {} as never
const NOW = new Date('2026-01-01T12:00:00Z').getTime()

const row = async (id: string) => (await client.execute({ sql: 'SELECT * FROM auth_frigear_handoffs WHERE id = ?', args: [id] })).rows[0]

beforeAll(async () => {
  await client.execute(`CREATE TABLE auth_frigear_handoffs (id text PRIMARY KEY NOT NULL, secretHash text NOT NULL, stateHash text NOT NULL UNIQUE, codeVerifier text NOT NULL, nonce text NOT NULL, redirectUri text NOT NULL, redirectTo text, status text DEFAULT 'pending' NOT NULL, error text, userId integer, sessionData text, expiresAt integer NOT NULL, createdAt integer NOT NULL)`)
})

beforeEach(async () => {
  await client.execute('DELETE FROM auth_frigear_handoffs')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  query = {}
  appSecret = 'a-test-only-app-secret'
  fetchCalls.length = 0
  tokenResponse = { id_token: 'id', access_token: 'access' }
  loginResult = { user: { id: 7 }, session: { frigear: { id: '7' } } }
  resolveFrigearLogin.mockClear()
  responseStatus.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

const verifierOf = async (id: string) => openFrigearHandoffVerifier({ id, codeVerifier: String((await row(id))!.codeVerifier) })

const start = () => insertFrigearHandoff({ redirectUri: 'http://127.0.0.1:43123/auth/frigear', redirectTo: '/events' })

describe('PKCE and the authorization request', () => {
  it('asks for the code with an S256 challenge of the stored verifier, a nonce and a handoff state', async () => {
    const attempt = await start()
    const verifier = await verifierOf(attempt.id)
    expect(attempt.codeChallenge).toBe(await challengeFor(verifier!))
    expect(verifier).toMatch(/^[\w-]{43,128}$/)
    expect(isFrigearHandoffState(attempt.state)).toBe(true)
    expect(isFrigearHandoffState('plain-state')).toBe(false)

    const url = new URL(buildFrigearHandoffAuthorizeUrl('https://issuer.example/oauth/authorize', {
      clientId: 'desktop',
      redirectUri: 'http://127.0.0.1:43123/auth/frigear',
      scopes: ['openid', 'email'],
      state: attempt.state,
      nonce: attempt.nonce,
      codeChallenge: attempt.codeChallenge,
    }))
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'desktop',
      redirect_uri: 'http://127.0.0.1:43123/auth/frigear',
      scope: 'openid email',
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge: attempt.codeChallenge,
      code_challenge_method: 'S256',
    })
  })

  it('asks for the window\'s language with `ui_locales` when it is known', () => {
    const params = { clientId: 'desktop', redirectUri: 'http://127.0.0.1:43123/auth/frigear', scopes: ['openid'], state: 's', nonce: 'n', codeChallenge: 'c' }
    expect(new URL(buildFrigearHandoffAuthorizeUrl('https://issuer.example/oauth/authorize', { ...params, uiLocales: 'en' })).searchParams.get('ui_locales')).toBe('en')
    expect(new URL(buildFrigearHandoffAuthorizeUrl('https://issuer.example/oauth/authorize', params)).searchParams.has('ui_locales')).toBe(false)
  })

  it('stores only hashes of the window secret and the state', async () => {
    const attempt = await start()
    const stored = JSON.stringify(await row(attempt.id))
    expect(stored).not.toContain(attempt.secret)
    expect(stored).not.toContain(attempt.state)
  })

  it('stores the PKCE verifier encrypted, bound to its attempt and to appSecret', async () => {
    const attempt = await start()
    const sealed = String((await row(attempt.id))!.codeVerifier)
    expect(sealed).toMatch(/^v1\./)
    const verifier = await verifierOf(attempt.id)
    expect(verifier).toMatch(/^[\w-]{43,128}$/)
    expect(sealed).not.toContain(verifier)
    // Moved to another attempt's row, it does not open.
    expect(await openFrigearHandoffVerifier({ id: 'afh_other', codeVerifier: sealed })).toBeNull()
    appSecret = 'another-app-secret'
    expect(await openFrigearHandoffVerifier({ id: attempt.id, codeVerifier: sealed })).toBeNull()
  })
})

describe('attempt lifecycle', () => {
  it('belongs to the window holding its secret only', async () => {
    const attempt = await start()
    expect(await findFrigearHandoff(attempt.id, attempt.secret)).toMatchObject({ id: attempt.id, status: 'pending' })
    expect(await findFrigearHandoff(attempt.id, 'another-window')).toBeUndefined()
    expect(await findFrigearHandoff('afh_unknown', attempt.secret)).toBeUndefined()
  })

  it('completes once and is collected once, by its own window', async () => {
    const attempt = await start()
    const claimed = await beginFrigearHandoffCallback(attempt.state)
    expect(claimed).toMatchObject({ id: attempt.id, status: 'exchanging' })
    // A replayed callback finds nothing to claim.
    expect(await beginFrigearHandoffCallback(attempt.state)).toBeUndefined()
    expect(frigearHandoffStatusOf((await findFrigearHandoff(attempt.id, attempt.secret))!)).toBe('pending')

    await finishFrigearHandoff(attempt.id, { userId: 7, sessionData: { frigear: { id: '7' } } })
    expect(frigearHandoffStatusOf((await findFrigearHandoff(attempt.id, attempt.secret))!)).toBe('complete')

    expect(await takeFrigearHandoff(attempt.id, 'another-window')).toBeUndefined()
    expect(await takeFrigearHandoff(attempt.id, attempt.secret)).toMatchObject({ userId: 7, redirectTo: '/events', sessionData: { frigear: { id: '7' } } })
    expect(await takeFrigearHandoff(attempt.id, attempt.secret)).toBeUndefined()
    expect(await row(attempt.id)).toBeUndefined()
  })

  it('cannot be collected before the browser came back', async () => {
    const attempt = await start()
    expect(await takeFrigearHandoff(attempt.id, attempt.secret)).toBeUndefined()
  })

  it('expires after 10 minutes, also once complete', async () => {
    const attempt = await start()
    vi.setSystemTime(NOW + FRIGEAR_HANDOFF_TTL_SECONDS * 1000 + 1000)
    expect(await beginFrigearHandoffCallback(attempt.state)).toBeUndefined()
    expect(frigearHandoffStatusOf((await findFrigearHandoff(attempt.id, attempt.secret))!)).toBe('expired')

    vi.setSystemTime(NOW)
    const other = await start()
    await beginFrigearHandoffCallback(other.state)
    await finishFrigearHandoff(other.id, { userId: 7, sessionData: {} })
    vi.setSystemTime(NOW + FRIGEAR_HANDOFF_TTL_SECONDS * 1000 + 1000)
    expect(frigearHandoffStatusOf((await findFrigearHandoff(other.id, other.secret))!)).toBe('expired')
    expect(await takeFrigearHandoff(other.id, other.secret)).toBeUndefined()
  })

  it('removes expired attempts when a new one starts', async () => {
    const old = await start()
    vi.setSystemTime(NOW + FRIGEAR_HANDOFF_TTL_SECONDS * 1000 + 1000)
    await start()
    expect(await row(old.id)).toBeUndefined()
  })

  it('records a failure the window can read, and is cancelled only by its own window', async () => {
    const attempt = await start()
    await beginFrigearHandoffCallback(attempt.state)
    await finishFrigearHandoff(attempt.id, { error: 'oauth-unverified' })
    const failed = (await findFrigearHandoff(attempt.id, attempt.secret))!
    expect(frigearHandoffStatusOf(failed)).toBe('failed')
    expect(handoff.toFrigearHandoffDto(failed)).toMatchObject({ status: 'failed', error: 'oauth-unverified' })
    expect(await takeFrigearHandoff(attempt.id, attempt.secret)).toBeUndefined()

    await removeFrigearHandoff(attempt.id, 'another-window')
    expect(await row(attempt.id)).toBeDefined()
    await removeFrigearHandoff(attempt.id, attempt.secret)
    expect(await row(attempt.id)).toBeUndefined()
  })
})

describe('the browser callback', () => {
  it('exchanges the code with the stored verifier and no secret, checks the nonce, and completes the attempt', async () => {
    const attempt = await start()
    const verifier = await verifierOf(attempt.id)
    query = { code: 'the-code', state: attempt.state }
    const page = await handleFrigearHandoffCallback(event, sso)
    expect(page).toContain('Signed in')
    expect(responseStatus).toHaveBeenCalledWith(event, 200)

    const body = new URLSearchParams(fetchCalls[0]!.options.body)
    expect(fetchCalls[0]!.url).toBe('https://issuer.example/oauth/token')
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: 'http://127.0.0.1:43123/auth/frigear',
      code_verifier: verifier,
      client_id: 'desktop',
    })
    expect(resolveFrigearLogin).toHaveBeenCalledWith(sso, {}, tokenResponse, { nonce: attempt.nonce })
    expect(await findFrigearHandoff(attempt.id, attempt.secret)).toMatchObject({ status: 'complete', userId: 7 })
  })

  it('sends the client secret when one is configured', async () => {
    const attempt = await start()
    query = { code: 'the-code', state: attempt.state }
    await handleFrigearHandoffCallback(event, { ...(sso as object), clientSecret: 'shh' } as never)
    expect(new URLSearchParams(fetchCalls[0]!.options.body).get('client_secret')).toBe('shh')
  })

  it('fails the attempt when the user is refused at frigear.nu, without an exchange', async () => {
    const attempt = await start()
    query = { error: 'access_denied', state: attempt.state }
    expect(await handleFrigearHandoffCallback(event, sso)).toContain('Sign-in failed')
    expect(fetchCalls).toHaveLength(0)
    expect(await findFrigearHandoff(attempt.id, attempt.secret)).toMatchObject({ status: 'failed', error: 'access_denied' })
  })

  it('fails the attempt when the login is refused (unverified address, bad token)', async () => {
    const attempt = await start()
    loginResult = { error: 'oauth-unverified' }
    query = { code: 'the-code', state: attempt.state }
    await handleFrigearHandoffCallback(event, sso)
    expect(await findFrigearHandoff(attempt.id, attempt.secret)).toMatchObject({ status: 'failed', error: 'oauth-unverified' })

    const other = await start()
    resolveFrigearLogin.mockRejectedValueOnce(Object.assign(new Error('bad nonce'), { statusCode: 401 }))
    query = { code: 'the-code', state: other.state }
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    await handleFrigearHandoffCallback(event, sso)
    expect(await findFrigearHandoff(other.id, other.secret)).toMatchObject({ status: 'failed', error: 'exchange_failed' })
  })

  it('does nothing for a replayed or unknown state', async () => {
    const attempt = await start()
    query = { code: 'the-code', state: attempt.state }
    await handleFrigearHandoffCallback(event, sso)
    fetchCalls.length = 0
    expect(await handleFrigearHandoffCallback(event, sso)).toContain('Sign-in failed')
    query = { code: 'the-code', state: 'fh.unknown' }
    expect(await handleFrigearHandoffCallback(event, sso)).toContain('Sign-in failed')
    expect(fetchCalls).toHaveLength(0)
  })

  it('offers only a deep link with a harmless scheme', () => {
    expect(safeFrigearHandoffReturnUrl('frigear-desktop:/auth/return')).toBe('frigear-desktop:/auth/return')
    expect(safeFrigearHandoffReturnUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeFrigearHandoffReturnUrl('data:text/html,x')).toBeUndefined()
    expect(safeFrigearHandoffReturnUrl('/relative')).toBeUndefined()
  })
})
