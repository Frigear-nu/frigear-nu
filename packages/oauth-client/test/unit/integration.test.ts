import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryLock, createOAuthClient, memoryStorage } from '../../src/runtime/core'
import type { OAuthChangeEvent, OAuthClientOptions } from '../../src/runtime/core'

// An in-process issuer that behaves like `@frigear-nu/oauth-server` where it matters to the client: discovery,
// mandatory S256 PKCE, public clients (no secret), single-use codes, rotating refresh tokens with family reuse
// detection (reusing a rotated refresh token revokes the whole family), revocation, userinfo and an API that
// accepts its access tokens. It auto-approves consent.

const CLIENT_ID = 'mobile'
const REDIRECT = 'nu.frigear.test:/auth/callback'
const random = () => randomBytes(24).toString('base64url')
const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')
const unsignedJwt = (claims: Record<string, unknown>) =>
  `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.x`

const db = {
  codes: new Map<string, { challenge: string, redirectUri: string, nonce?: string, sub: string }>(),
  refresh: new Map<string, { family: string, used: boolean, sub: string }>(),
  revokedFamilies: new Set<string>(),
  access: new Map<string, { sub: string, expiresAt: number }>(),
  rotations: 0,
  reuseDetected: 0,
}

let issuer = ''

const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}
const readForm = async (req: IncomingMessage) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return new URLSearchParams(raw)
}
const issueTokens = (sub: string, family: string, nonce?: string) => {
  const accessToken = random()
  const refreshToken = random()
  db.access.set(accessToken, { sub, expiresAt: Date.now() + 600_000 })
  db.refresh.set(refreshToken, { family, used: false, sub })
  const now = Math.floor(Date.now() / 1000)
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 600,
    refresh_token: refreshToken,
    scope: 'openid offline_access',
    id_token: unsignedJwt({ iss: issuer, aud: CLIENT_ID, sub, iat: now, exp: now + 600, ...(nonce ? { nonce } : {}) }),
  }
}
const bearer = (req: IncomingMessage) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '') ?? ''
  const entry = db.access.get(token)
  return entry && entry.expiresAt > Date.now() ? entry : null
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', issuer)
  if (url.pathname === '/.well-known/openid-configuration') {
    return send(res, 200, {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      userinfo_endpoint: `${issuer}/oauth/userinfo`,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    })
  }
  if (url.pathname === '/oauth/authorize') {
    const p = url.searchParams
    if (p.get('client_id') !== CLIENT_ID || p.get('redirect_uri') !== REDIRECT) return send(res, 400, { error: 'invalid_request' })
    if (p.get('code_challenge_method') !== 'S256' || !p.get('code_challenge')) return send(res, 400, { error: 'invalid_request' })
    const code = random()
    db.codes.set(code, { challenge: p.get('code_challenge')!, redirectUri: p.get('redirect_uri')!, nonce: p.get('nonce') ?? undefined, sub: '1001' })
    const location = new URL(p.get('redirect_uri')!)
    location.searchParams.set('code', code)
    location.searchParams.set('state', p.get('state')!)
    res.writeHead(302, { location: location.toString() })
    return res.end()
  }
  if (url.pathname === '/oauth/token' && req.method === 'POST') {
    const body = await readForm(req)
    if (body.get('client_id') !== CLIENT_ID || body.has('client_secret')) return send(res, 401, { error: 'invalid_client' })
    if (body.get('grant_type') === 'authorization_code') {
      const code = db.codes.get(body.get('code') ?? '')
      db.codes.delete(body.get('code') ?? '')
      if (!code || code.redirectUri !== body.get('redirect_uri') || s256(body.get('code_verifier') ?? '') !== code.challenge) {
        return send(res, 400, { error: 'invalid_grant' })
      }
      return send(res, 200, issueTokens(code.sub, random(), code.nonce), { 'cache-control': 'no-store' })
    }
    if (body.get('grant_type') === 'refresh_token') {
      const entry = db.refresh.get(body.get('refresh_token') ?? '')
      if (!entry || db.revokedFamilies.has(entry.family)) return send(res, 400, { error: 'invalid_grant' })
      if (entry.used) {
        // Reuse of a rotated token: someone has a copy. Revoke the whole family.
        db.reuseDetected++
        db.revokedFamilies.add(entry.family)
        return send(res, 400, { error: 'invalid_grant', error_description: 'Refresh token reuse detected.' })
      }
      entry.used = true
      db.rotations++
      return send(res, 200, issueTokens(entry.sub, entry.family))
    }
    return send(res, 400, { error: 'unsupported_grant_type' })
  }
  if (url.pathname === '/oauth/revoke' && req.method === 'POST') {
    const entry = db.refresh.get((await readForm(req)).get('token') ?? '')
    if (entry) db.revokedFamilies.add(entry.family)
    return send(res, 200, {})
  }
  if (url.pathname === '/oauth/userinfo' || url.pathname === '/api/me') {
    const entry = bearer(req)
    return entry ? send(res, 200, { sub: entry.sub, name: 'Ada' }) : send(res, 401, { error: 'invalid_token' })
  }
  send(res, 404, {})
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
afterAll(() => void server.close())

const newClient = (options: Partial<OAuthClientOptions> = {}) => createOAuthClient({
  issuer,
  clientId: CLIENT_ID,
  redirectUri: REDIRECT,
  scope: ['openid', 'offline_access'],
  lock: createMemoryLock(),
  ...options,
})

/** The browser step: follow the authorize URL to the redirect the server answers with. */
async function signIn(client: ReturnType<typeof newClient>) {
  const { url } = await client.startAuthorization({ returnTo: '/home' })
  const response = await fetch(url, { redirect: 'manual' })
  return client.handleCallback(response.headers.get('location')!)
}

/** Makes the client's access token look expired, so the next call refreshes. */
async function expire(storage: ReturnType<typeof memoryStorage>) {
  const tokens = JSON.parse((await storage.get(`oauth:${CLIENT_ID}:tokens`))!)
  await storage.set(`oauth:${CLIENT_ID}:tokens`, JSON.stringify({ ...tokens, expiresAt: Date.now() }))
}

describe('against a rotating issuer', () => {
  beforeEach(() => {
    db.rotations = 0
    db.reuseDetected = 0
  })

  it('signs in with discovery and PKCE, validates the id_token and calls userinfo and the API', async () => {
    const client = newClient()
    const { tokens, returnTo } = await signIn(client)
    expect(returnTo).toBe('/home')
    expect(tokens.refreshToken).toBeTruthy()
    expect(await client.getClaims()).toMatchObject({ sub: '1001', iss: issuer, aud: CLIENT_ID })
    expect(await client.fetchUserInfo()).toEqual({ sub: '1001', name: 'Ada' })
    expect((await client.fetch(`${issuer}/api/me`)).status).toBe(200)
  })

  it('rotates once for 10 parallel callers, and the old refresh token is dead', async () => {
    const storage = memoryStorage()
    const client = newClient({ storage })
    const { tokens: first } = await signIn(client)
    await expire(storage)

    const results = await Promise.all(Array.from({ length: 10 }, () => client.getAccessToken()))
    expect(new Set(results).size).toBe(1)
    expect(results[0]).not.toBe(first.accessToken)
    expect(db.rotations).toBe(1)
    expect(db.reuseDetected).toBe(0)
    expect((await client.getTokens())!.refreshToken).not.toBe(first.refreshToken)
  })

  it('keeps the family alive when two tabs share storage and the lock', async () => {
    const storage = memoryStorage()
    const lock = createMemoryLock()
    const tabA = newClient({ storage, lock })
    const tabB = newClient({ storage, lock })
    await signIn(tabA)

    for (let round = 0; round < 3; round++) {
      await expire(storage)
      const [a, b] = await Promise.all([tabA.getAccessToken(), tabB.getAccessToken()])
      expect(a).toBe(b)
    }
    expect(db.rotations).toBe(3)
    expect(db.reuseDetected).toBe(0)
    expect((await tabB.fetch(`${issuer}/api/me`)).status).toBe(200)
  })

  it('signs out when a stale copy of the refresh token got the family revoked', async () => {
    const storage = memoryStorage()
    const client = newClient({ storage })
    await signIn(client)
    // A copy of the tokens (a restored backup, a second device with copied storage).
    const copy = memoryStorage()
    await copy.set(`oauth:${CLIENT_ID}:tokens`, (await storage.get(`oauth:${CLIENT_ID}:tokens`))!)
    const stale = newClient({ storage: copy })

    await expire(storage)
    expect(await client.getAccessToken()).toBeTruthy()
    await expire(copy)
    expect(await stale.getAccessToken()).toBeNull()
    expect(db.reuseDetected).toBe(1)

    // The family is revoked, so the legitimate client's next refresh ends its session too.
    const events: OAuthChangeEvent[] = []
    client.onChange(event => events.push(event))
    await expire(storage)
    expect(await client.getAccessToken()).toBeNull()
    expect(events).toMatchObject([{ type: 'signed-out', reason: 'invalid_grant' }])
  })

  it('logout revokes the family on the server', async () => {
    const storage = memoryStorage()
    const client = newClient({ storage })
    const { tokens } = await signIn(client)
    await client.logout()
    expect(await client.isAuthenticated()).toBe(false)

    const response = await fetch(`${issuer}/oauth/token`, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken!, client_id: CLIENT_ID }),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_grant' })
  })

  it('refreshes and retries an API call the server refused with 401', async () => {
    const client = newClient()
    const { tokens } = await signIn(client)
    // The server forgets the access token (e.g. it restarted with another key): the next call gets a 401.
    db.access.delete(tokens.accessToken)
    const response = await client.fetch(`${issuer}/api/me`)
    expect(response.status).toBe(200)
    expect(db.rotations).toBe(1)
  })
})
