import { createPublicKey, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose'
import { buildFcmAssertion, buildFcmRequest, createFcmSender, isDeadFcmToken, parseFcmServiceAccount } from '../../src/runtime/providers/fcm'
import { apnsHost, buildApnsJwt, buildApnsRequest, createApnsSender, isDeadApnsToken } from '../../src/runtime/providers/apns'
import { normalizePemKey } from '../../src/runtime/providers/types'
import type { Http2Request } from '../../src/runtime/providers/types'
import { Http2UnsupportedError } from '../../src/runtime/providers/http2'

const pem = { privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } } as const
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048, ...pem })
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1', ...pem })

const verifyKey = async (publicPem: string, alg: 'RS256' | 'ES256') => importJWK(createPublicKey(publicPem).export({ format: 'jwk' }), alg)

const serviceAccountJson = (privateKey = rsa.privateKey) => JSON.stringify({
  project_id: 'demo-project',
  client_email: 'push@demo-project.iam.gserviceaccount.com',
  private_key: privateKey,
  token_uri: 'https://oauth2.example.test/token',
})

const message = { token: 'device-token', title: 'Shift tomorrow', body: 'You work 18:00 - 23:00', url: '/shifts/42', data: { shiftId: '42' } }

describe('normalizePemKey', () => {
  it('strips quotes and turns literal \\n into newlines', () => {
    expect(normalizePemKey('"-----BEGIN KEY-----\\nabc\\n-----END KEY-----"')).toBe('-----BEGIN KEY-----\nabc\n-----END KEY-----')
  })
})

describe('FCM', () => {
  it('reads the service account file and rejects unusable ones', () => {
    const account = parseFcmServiceAccount(serviceAccountJson())
    expect(account).toMatchObject({ projectId: 'demo-project', clientEmail: 'push@demo-project.iam.gserviceaccount.com', tokenUri: 'https://oauth2.example.test/token' })
    expect(() => parseFcmServiceAccount('not json')).toThrow(/not valid JSON/)
    expect(() => parseFcmServiceAccount(JSON.stringify({ project_id: 'x' }))).toThrow(/client_email/)
    // The default token endpoint when the file names none.
    expect(parseFcmServiceAccount(JSON.stringify({ project_id: 'x', client_email: 'e', private_key: 'k' })).tokenUri).toBe('https://oauth2.googleapis.com/token')
  })

  it('signs the OAuth assertion with RS256 for the service account', async () => {
    const account = parseFcmServiceAccount(serviceAccountJson())
    const jwt = await buildFcmAssertion(account, 1_700_000_000_000)
    expect(decodeProtectedHeader(jwt)).toMatchObject({ alg: 'RS256', typ: 'JWT' })
    const { payload } = await jwtVerify(jwt, await verifyKey(rsa.publicKey, 'RS256'), {
      issuer: account.clientEmail,
      audience: account.tokenUri,
      currentDate: new Date(1_700_000_100_000),
    })
    expect(payload).toMatchObject({ scope: 'https://www.googleapis.com/auth/firebase.messaging', iat: 1_700_000_000, exp: 1_700_003_600 })
  })

  it('builds the HTTP v1 request with string data and the url as data', () => {
    const request = buildFcmRequest('demo-project', 'ya29.token', message)
    expect(request.url).toBe('https://fcm.googleapis.com/v1/projects/demo-project/messages:send')
    expect(request.headers).toMatchObject({ 'authorization': 'Bearer ya29.token', 'content-type': 'application/json' })
    expect(request.body).toEqual({
      message: {
        token: 'device-token',
        notification: { title: 'Shift tomorrow', body: 'You work 18:00 - 23:00' },
        data: { shiftId: '42', url: '/shifts/42' },
        android: { priority: 'HIGH' },
        apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
      },
    })
    expect(buildFcmRequest('p', 't', { token: 'x', title: 'a', body: 'b' }).body.message).not.toHaveProperty('data')
  })

  it('classifies dead tokens', () => {
    expect(isDeadFcmToken(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } })).toBe(true)
    expect(isDeadFcmToken(400, { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } })).toBe(true)
    expect(isDeadFcmToken(400, { error: { status: 'INVALID_ARGUMENT', message: 'Bad.', details: [{ fieldViolations: [{ field: 'message.token' }] }] } })).toBe(true)
    // A bare 404 / NOT_FOUND can be a wrong project or endpoint, not a dead token.
    expect(isDeadFcmToken(404, undefined)).toBe(false)
    expect(isDeadFcmToken(404, { error: { status: 'NOT_FOUND', message: 'Requested entity was not found.' } })).toBe(false)
    // A rejected payload is not the token's fault.
    expect(isDeadFcmToken(400, { error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received.' } })).toBe(false)
    expect(isDeadFcmToken(500, { error: { status: 'INTERNAL' } })).toBe(false)
  })

  it('fetches one access token for a burst, sends with it and reports dead tokens', async () => {
    const requests: Array<{ url: string, init?: RequestInit }> = []
    let now = 1_700_000_000_000
    const sender = createFcmSender(parseFcmServiceAccount(serviceAccountJson()), {
      now: () => now,
      fetch: async (url, init) => {
        requests.push({ url, init })
        if (url === 'https://oauth2.example.test/token') return Response.json({ access_token: 'ya29.abc', expires_in: 3600 })
        return JSON.parse(String(init?.body)).message.token === 'gone'
          ? Response.json({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }, { status: 404 })
          : Response.json({ name: 'projects/demo-project/messages/1' })
      },
    })

    expect(await sender.send(message)).toEqual({ status: 'sent' })
    expect(await sender.send({ ...message, token: 'other' })).toEqual({ status: 'sent' })
    expect(await sender.send({ ...message, token: 'gone' })).toMatchObject({ status: 'dead' })
    expect(requests.filter(request => request.url.includes('oauth2'))).toHaveLength(1)
    expect(requests.at(1)!.init?.headers).toMatchObject({ authorization: 'Bearer ya29.abc' })

    // Past its lifetime the token is fetched again.
    now += 3600 * 1000
    await sender.send(message)
    expect(requests.filter(request => request.url.includes('oauth2'))).toHaveLength(2)
  })

  it('reports a provider failure, a failed token request and a thrown error as failed, never as dead', async () => {
    const account = parseFcmServiceAccount(serviceAccountJson())
    const failing = createFcmSender(account, { fetch: async url => url.includes('oauth2') ? Response.json({ access_token: 't' }) : Response.json({ error: { status: 'INTERNAL' } }, { status: 500 }) })
    expect(await failing.send(message)).toMatchObject({ status: 'failed', reason: expect.stringContaining('500') })

    const noToken = createFcmSender(account, { fetch: async () => new Response('denied', { status: 401 }) })
    expect(await noToken.send(message)).toMatchObject({ status: 'failed', reason: expect.stringContaining('FCM token request failed') })

    const offline = createFcmSender(account, { fetch: () => Promise.reject(new Error('offline')) })
    expect(await offline.send(message)).toEqual({ status: 'failed', reason: 'offline' })
  })
})

describe('APNs', () => {
  const config = { keyId: 'KEY1234567', teamId: 'TEAM123456', topic: 'com.example.app', privateKey: ec.privateKey, sandbox: false }

  it('signs the provider token with ES256, key id and team id', async () => {
    const jwt = await buildApnsJwt(config, 1_700_000_000_000)
    expect(decodeProtectedHeader(jwt)).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' })
    const { payload } = await jwtVerify(jwt, await verifyKey(ec.publicKey, 'ES256'), { issuer: 'TEAM123456', currentDate: new Date(1_700_000_100_000), maxTokenAge: '1h' })
    expect(payload).toMatchObject({ iss: 'TEAM123456', iat: 1_700_000_000 })
  })

  it('accepts the key with literal \\n as pasted in an env file', async () => {
    const oneLine = ec.privateKey.trim().replaceAll('\n', '\\n')
    expect(decodeProtectedHeader(await buildApnsJwt({ ...config, privateKey: `"${oneLine}"` }))).toMatchObject({ alg: 'ES256' })
  })

  it('builds the request for production and the sandbox', () => {
    expect(apnsHost(false)).toBe('api.push.apple.com')
    expect(apnsHost(true)).toBe('api.sandbox.push.apple.com')
    const request = buildApnsRequest(config, 'jwt', message)
    expect(request.url).toBe('https://api.push.apple.com/3/device/device-token')
    expect(request.headers).toMatchObject({ 'authorization': 'bearer jwt', 'apns-topic': 'com.example.app', 'apns-push-type': 'alert', 'apns-priority': '10' })
    expect(request.body).toEqual({ shiftId: '42', url: '/shifts/42', aps: { alert: { title: 'Shift tomorrow', body: 'You work 18:00 - 23:00' }, sound: 'default' } })
    expect(buildApnsRequest({ ...config, sandbox: true }, 'jwt', message).url).toContain('api.sandbox.push.apple.com')
  })

  it('classifies dead tokens', () => {
    expect(isDeadApnsToken(410, 'Unregistered')).toBe(true)
    expect(isDeadApnsToken(400, 'BadDeviceToken')).toBe(true)
    expect(isDeadApnsToken(400, 'BadTopic')).toBe(false)
    expect(isDeadApnsToken(403, 'InvalidProviderToken')).toBe(false)
    expect(isDeadApnsToken(500, 'InternalServerError')).toBe(false)
  })

  it('sends over the HTTP/2 transport, never over fetch, and keeps the JWT for 50 minutes', async () => {
    const requests: Http2Request[] = []
    let now = 1_700_000_000_000
    const sender = createApnsSender(config, {
      now: () => now,
      http2: async (request) => {
        requests.push(request)
        return { status: 200, body: '' }
      },
      fetch: () => Promise.reject(new Error('APNs must not go through fetch')),
      timeoutMs: 1234,
    })
    expect(await sender.send(message)).toEqual({ status: 'sent' })
    expect(requests[0]).toMatchObject({ origin: 'https://api.push.apple.com', path: '/3/device/device-token', timeoutMs: 1234 })
    expect(requests[0]!.headers).toMatchObject({ 'apns-topic': 'com.example.app', 'apns-push-type': 'alert' })
    expect(JSON.parse(requests[0]!.body)).toMatchObject({ aps: { alert: { title: 'Shift tomorrow' } } })

    now += 10 * 60 * 1000
    await sender.send(message)
    expect(new Set(requests.map(request => request.headers.authorization)).size).toBe(1)
    now += 41 * 60 * 1000
    await sender.send(message)
    expect(new Set(requests.map(request => request.headers.authorization)).size).toBe(2)
  })

  it('maps the answers: dead tokens, an ambiguous BadDeviceToken, failures, timeouts', async () => {
    const answer = (status: number, reason: string) => createApnsSender(config, { http2: async () => ({ status, body: JSON.stringify({ reason }) }) })
    expect(await answer(410, 'Unregistered').send(message)).toEqual({ status: 'dead', reason: '410 Unregistered', ambiguous: false })
    expect(await answer(400, 'BadDeviceToken').send(message)).toMatchObject({ status: 'dead', ambiguous: true })
    expect(await answer(403, 'InvalidProviderToken').send(message)).toMatchObject({ status: 'failed' })
    expect(await answer(500, 'InternalServerError').send(message)).toMatchObject({ status: 'failed' })
    expect(await createApnsSender(config, { http2: () => Promise.reject(new Error('offline')) }).send(message)).toEqual({ status: 'failed', reason: 'offline' })
    const timedOut = createApnsSender(config, { timeoutMs: 50, http2: () => Promise.reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })) })
    expect(await timedOut.send(message)).toEqual({ status: 'failed', reason: 'timed out after 50 ms' })
  })

  it('fails clearly, logs once and never marks a token dead without an HTTP/2 client', async () => {
    const warn = vi.fn()
    const sender = createApnsSender(config, { log: { warn }, http2: () => Promise.reject(new Http2UnsupportedError('no client')) })
    const first = await sender.send(message)
    const second = await createApnsSender(config, { log: { warn }, http2: () => Promise.reject(new Http2UnsupportedError()) }).send(message)
    expect(first).toMatchObject({ status: 'failed', reason: expect.stringContaining('HTTP/2 is not available') })
    expect(second.status).toBe('failed')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('Register the FCM token on iOS')
  })
})

describe('provider timeouts', () => {
  const account = () => parseFcmServiceAccount(serviceAccountJson())
  // A fetch that only ever ends by being aborted.
  const hanging = (calls: string[] = []) => (url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    calls.push(url)
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
  })

  it('counts a hanging FCM token request as failed, and asks again for the next send', async () => {
    const calls: string[] = []
    const sender = createFcmSender(account(), { fetch: hanging(calls), timeoutMs: 20 })
    expect(await sender.send(message)).toEqual({ status: 'failed', reason: 'timed out after 20 ms' })
    expect(await sender.send(message)).toMatchObject({ status: 'failed' })
    // Not stuck on the first, shared promise: the token was requested again.
    expect(calls).toHaveLength(2)
  })

  it('counts a hanging FCM send as failed, never dead', async () => {
    const sender = createFcmSender(account(), {
      timeoutMs: 20,
      fetch: (url, init) => url.includes('oauth2') ? Promise.resolve(Response.json({ access_token: 't', expires_in: 3600 })) : hanging()(url, init),
    })
    expect(await sender.send(message)).toEqual({ status: 'failed', reason: 'timed out after 20 ms' })
  })

  it('passes a signal to every FCM request', async () => {
    const signals: Array<AbortSignal | null | undefined> = []
    const sender = createFcmSender(account(), {
      fetch: async (url, init) => {
        signals.push(init?.signal)
        return url.includes('oauth2') ? Response.json({ access_token: 't', expires_in: 3600 }) : Response.json({ name: 'x' })
      },
    })
    await sender.send(message)
    expect(signals).toHaveLength(2)
    expect(signals.every(signal => signal instanceof AbortSignal)).toBe(true)
  })
})
