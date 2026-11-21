import { SignJWT, importPKCS8 } from 'jose'
import { callFetch, normalizePemKey } from './types'
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
  return {
    url: `https://${apnsHost(config.sandbox)}/3/device/${encodeURIComponent(message.token)}`,
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

/** A sender for one APNs key. It keeps the JWT for 50 minutes. */
export function createApnsSender(config: ApnsConfig, env: ProviderEnvironment = {}): DeviceSender {
  const doFetch = env.fetch ?? callFetch
  const now = env.now ?? Date.now
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
        const response = await doFetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) })
        if (response.ok) return { status: 'sent' }
        const text = await response.text().catch(() => '')
        let reason: string | undefined
        try {
          reason = (JSON.parse(text) as { reason?: string }).reason
        }
        catch {
          reason = undefined
        }
        const description = `${response.status}${reason ? ` ${reason}` : text ? ` ${text.slice(0, 300)}` : ''}`
        if (isDeadApnsToken(response.status, reason)) return { status: 'dead', reason: description }
        // A rejected provider token: sign a new one on the next send.
        if (reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken') cached = undefined
        return { status: 'failed', reason: description }
      }
      catch (error) {
        return { status: 'failed', reason: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
