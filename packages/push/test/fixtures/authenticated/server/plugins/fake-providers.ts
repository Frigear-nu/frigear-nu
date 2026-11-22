import { createPublicKey } from 'node:crypto'
import { importJWK, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'

// Test-only: replaces the global `fetch` for Google's OAuth endpoint, FCM and APNs, so no request leaves the process.
// Every call is recorded (served from `/api/test/provider-calls`) together with whether its JWT verified against the
// public half of the configured test key, with the right algorithm, issuer and audience.
//
// Tokens steer the answer: one containing `dead` is a dead token (FCM 404 UNREGISTERED, APNs 410 Unregistered), one
// containing `broken` is a provider failure (500), one containing `rejected` is refused for the device (FCM 400, APNs
// 400 DeviceTokenNotForTopic). A token in `healed` (`POST /api/test/heal`) is accepted whatever it contains.
export type FakeCall = {
  provider: 'google-oauth' | 'fcm' | 'apns'
  url: string
  headers: Record<string, string>
  body: unknown
  verified: boolean
  claims?: JWTPayload
  header?: Record<string, unknown>
  error?: string
}

const calls: FakeCall[] = []
export const getFakeProviderCalls = () => calls
export const resetFakeProviderCalls = () => {
  calls.length = 0
}

const FCM_ACCESS_TOKEN = 'ya29.fake-access-token'

const healed = new Set<string>()
export const setFakeTokenHealed = (token: string, value: boolean) => {
  if (value) healed.add(token)
  else healed.delete(token)
}

const lower = (headers: HeadersInit | undefined): Record<string, string> =>
  Object.fromEntries([...new Headers(headers).entries()].map(([key, value]) => [key.toLowerCase(), value]))

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function verify(jwt: string, pem: string, alg: 'RS256' | 'ES256', options: { issuer: string, audience?: string }) {
  const key = await importJWK(createPublicKey(pem).export({ format: 'jwk' }), alg)
  const { payload, protectedHeader } = await jwtVerify(jwt, key, { algorithms: [alg], issuer: options.issuer, audience: options.audience })
  return { payload, header: protectedHeader as Record<string, unknown> }
}

export default defineNitroPlugin(() => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const config = useRuntimeConfig().push
    const headers = lower(init?.headers)
    const raw = typeof init?.body === 'string' ? init.body : ''

    if (url.hostname === 'oauth2.googleapis.com') {
      const account = JSON.parse(config.fcm.serviceAccount) as { client_email: string, private_key: string, token_uri: string }
      const call: FakeCall = { provider: 'google-oauth', url: url.href, headers, body: Object.fromEntries(new URLSearchParams(raw)), verified: false }
      calls.push(call)
      try {
        const { payload, header } = await verify(String(new URLSearchParams(raw).get('assertion')), account.private_key, 'RS256', { issuer: account.client_email, audience: account.token_uri })
        call.claims = payload
        call.header = header
        call.verified = (payload as { scope?: string }).scope === 'https://www.googleapis.com/auth/firebase.messaging'
          && new URLSearchParams(raw).get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer'
      }
      catch (error) {
        call.error = String(error)
      }
      return call.verified ? json(200, { access_token: FCM_ACCESS_TOKEN, expires_in: 3600, token_type: 'Bearer' }) : json(400, { error: 'invalid_grant' })
    }

    if (url.hostname === 'fcm.googleapis.com') {
      const body = JSON.parse(raw) as { message: { token: string } }
      calls.push({ provider: 'fcm', url: url.href, headers, body, verified: headers.authorization === `Bearer ${FCM_ACCESS_TOKEN}` })
      if (headers.authorization !== `Bearer ${FCM_ACCESS_TOKEN}`) return json(401, { error: { status: 'UNAUTHENTICATED', message: 'Bad token.' } })
      if (healed.has(body.message.token)) return json(200, { name: 'projects/test-project/messages/1' })
      if (body.message.token.includes('rejected')) return json(400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.' } })
      if (body.message.token.includes('dead')) return json(404, { error: { code: 404, status: 'NOT_FOUND', message: 'Requested entity was not found.', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', 'errorCode': 'UNREGISTERED' }] } })
      if (body.message.token.includes('broken')) return json(500, { error: { code: 500, status: 'INTERNAL', message: 'Backend error.' } })
      return json(200, { name: 'projects/test-project/messages/1' })
    }

    // APNs is HTTP/2, which `fetch` does not speak: the sender goes through the transport set below, never through here.
    if (url.hostname === 'api.push.apple.com' || url.hostname === 'api.sandbox.push.apple.com') {
      throw new Error('APNs must not be reached through fetch: it needs HTTP/2.')
    }

    return realFetch(input, init)
  }) as typeof fetch

  // The HTTP/2 transport of the APNs sender, replaced with this fake (see `setPushHttp2Transport`).
  setPushHttp2Transport(async ({ origin, path, headers: sent, body }) => {
    const apns = useRuntimeConfig().push.apns
    const headers = lower(sent)
    const call: FakeCall = { provider: 'apns', url: `${origin}${path}`, headers, body: JSON.parse(body), verified: false }
    calls.push(call)
    try {
      const { payload, header } = await verify(String(headers.authorization?.replace(/^bearer /i, '')), apns.privateKey, 'ES256', { issuer: apns.teamId })
      call.claims = payload
      call.header = header
      call.verified = header.kid === apns.keyId && headers['apns-topic'] === apns.topic && headers['apns-push-type'] === 'alert'
    }
    catch (error) {
      call.error = String(error)
    }
    if (!call.verified) return { status: 403, body: JSON.stringify({ reason: 'InvalidProviderToken' }) }
    const token = path.split('/').pop() ?? ''
    if (healed.has(token)) return { status: 200, body: '' }
    if (token.includes('rejected')) return { status: 400, body: JSON.stringify({ reason: 'DeviceTokenNotForTopic' }) }
    if (token.includes('dead')) return { status: 410, body: JSON.stringify({ reason: 'Unregistered' }) }
    if (token.includes('baddevice')) return { status: 400, body: JSON.stringify({ reason: 'BadDeviceToken' }) }
    if (token.includes('broken')) return { status: 500, body: JSON.stringify({ reason: 'InternalServerError' }) }
    return { status: 200, body: '' }
  })
})
