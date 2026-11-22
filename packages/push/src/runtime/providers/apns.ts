import { SignJWT, importPKCS8 } from 'jose'
import { defaultHttp2Transport, Http2UnsupportedError } from './http2'
import { DEFAULT_TIMEOUT_MS, describeError, normalizePemKey } from './types'
import type { DeliveryOutcome, DeviceMessage, DeviceSender, ProviderEnvironment } from './types'

/** APNs wants a token no older than an hour and not renewed more often than every 20 minutes. */
const JWT_LIFETIME_MS = 50 * 60 * 1000

export type ApnsConfig = {
  keyId: string
  teamId: string
  /** The app's bundle id, sent as `apns-topic`. */
  topic: string
  /** The `.p8` key (PKCS8 PEM). */
  privateKey: string
  sandbox: boolean
}

/** The signed ES256 JWT that authenticates a request to APNs. */
export async function buildApnsJwt(config: Pick<ApnsConfig, 'keyId' | 'teamId' | 'privateKey'>, now: number = Date.now()): Promise<string> {
  const key = await importPKCS8(normalizePemKey(config.privateKey), 'ES256')
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
    .setIssuer(config.teamId)
    .setIssuedAt(Math.floor(now / 1000))
    .sign(key)
}

/** The APNs host: production, or the sandbox for development builds of the app. */
export const apnsHost = (sandbox: boolean) => sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'

/** The APNs request for one device. The url and the extra data travel next to `aps` in the payload. */
export function buildApnsRequest(config: Pick<ApnsConfig, 'topic' | 'sandbox'>, jwt: string, message: DeviceMessage) {
  const origin = `https://${apnsHost(config.sandbox)}`
  const path = `/3/device/${encodeURIComponent(message.token)}`
  return {
    origin,
    path,
    url: `${origin}${path}`,
    headers: {
      'authorization': `bearer ${jwt}`,
      'apns-topic': config.topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: {
      ...message.data,
      ...(message.url ? { url: message.url } : {}),
      aps: { alert: { title: message.title, body: message.body }, sound: 'default' },
    },
  }
}

/** Whether an APNs answer says the token will never work again (410 Unregistered, 400 BadDeviceToken). */
export function isDeadApnsToken(status: number, reason: string | undefined): boolean {
  return status === 410 || reason === 'Unregistered' || reason === 'BadDeviceToken'
}

let warnedUnsupported = false

/**
 * A sender for one APNs key. It sends over HTTP/2 (`env.http2`, by default `node:http2`: APNs refuses HTTP/1.1, which
 * is all `fetch` speaks on Node) and keeps the JWT for 50 minutes. Without an HTTP/2 client (Cloudflare Workers) every
 * send fails with a clear reason, is logged once, and never marks a token dead.
 */
export function createApnsSender(config: ApnsConfig, env: ProviderEnvironment = {}): DeviceSender {
  const transport = env.http2 ?? defaultHttp2Transport
  const now = env.now ?? Date.now
  const timeoutMs = env.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const log = env.log ?? console
  let cached: { jwt: string, issuedAt: number } | undefined

  async function jwt(): Promise<string> {
    if (cached && now() - cached.issuedAt < JWT_LIFETIME_MS) return cached.jwt
    const issuedAt = now()
    cached = { jwt: await buildApnsJwt(config, issuedAt), issuedAt }
    return cached.jwt
  }

  return {
    async send(message): Promise<DeliveryOutcome> {
      try {
        const request = buildApnsRequest(config, await jwt(), message)
        const response = await transport({ origin: request.origin, path: request.path, headers: request.headers, body: JSON.stringify(request.body), timeoutMs })
        if (response.status >= 200 && response.status < 300) return { status: 'sent' }
        let reason: string | undefined
        try {
          reason = (JSON.parse(response.body) as { reason?: string }).reason
        }
        catch {
          reason = undefined
        }
        const description = `${response.status}${reason ? ` ${reason}` : response.body ? ` ${response.body.slice(0, 300)}` : ''}`
        if (isDeadApnsToken(response.status, reason)) return { status: 'dead', reason: description, ambiguous: reason === 'BadDeviceToken' }
        // A rejected provider token: sign a new one on the next send.
        if (reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken') cached = undefined
        return { status: 'failed', reason: description }
      }
      catch (error) {
        if (error instanceof Http2UnsupportedError) {
          if (!warnedUnsupported) {
            warnedUnsupported = true
            log.warn(`[@frigear-nu/push] ${error.message}`)
          }
          return { status: 'failed', reason: error.message }
        }
        return { status: 'failed', reason: describeError(error, timeoutMs) }
      }
    },
  }
}
