import { createPublicKey } from 'node:crypto'
import { importJWK, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'

// Test-only: replaces the global `fetch` for Google's OAuth endpoint, FCM and APNs, so no request leaves the process.
// Every call is recorded (served from `/api/test/provider-calls`) together with whether its JWT verified against the
// public half of the configured test key, with the right algorithm, issuer and audience.
//
// Tokens steer the answer: one containing `dead` is a dead token (FCM 404 UNREGISTERED, APNs 410 Unregistered), one
// containing `broken` is a provider failure (500).
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
      if (body.message.token.includes('dead')) return json(404, { error: { code: 404, status: 'NOT_FOUND', message: 'Requested entity was not found.', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', 'errorCode': 'UNREGISTERED' }] } })
      if (body.message.token.includes('broken')) return json(500, { error: { code: 500, status: 'INTERNAL', message: 'Backend error.' } })
      return json(200, { name: 'projects/test-project/messages/1' })
    }

    if (url.hostname === 'api.push.apple.com' || url.hostname === 'api.sandbox.push.apple.com') {
      const apns = config.apns
      const call: FakeCall = { provider: 'apns', url: url.href, headers, body: JSON.parse(raw), verified: false }
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
      if (!call.verified) return json(403, { reason: 'InvalidProviderToken' })
      const token = url.pathname.split('/').pop() ?? ''
      if (token.includes('dead')) return json(410, { reason: 'Unregistered' })
      if (token.includes('broken')) return json(500, { reason: 'InternalServerError' })
      return new Response(null, { status: 200 })
    }

    return realFetch(input, init)
  }) as typeof fetch
})
