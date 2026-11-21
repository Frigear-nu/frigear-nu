import { SignJWT, importPKCS8 } from 'jose'
import { callFetch, describeResponse, normalizePemKey } from './types'
import type { DeliveryOutcome, DeviceMessage, DeviceSender, ProviderEnvironment } from './types'

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'

export type FcmServiceAccount = {
  projectId: string
  clientEmail: string
  /** PKCS8 PEM. */
  privateKey: string
  tokenUri: string
}

/** Reads the service account JSON of the Firebase console. Throws a readable error for anything unusable. */
export function parseFcmServiceAccount(raw: string): FcmServiceAccount {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw.trim())
  }
  catch {
    throw new Error('[@frigear-nu/push] push.fcm.serviceAccount is not valid JSON: paste the whole service account file.')
  }
  const { project_id: projectId, client_email: clientEmail, private_key: privateKey, token_uri: tokenUri } = parsed
  for (const [name, value] of Object.entries({ project_id: projectId, client_email: clientEmail, private_key: privateKey })) {
    if (typeof value !== 'string' || !value) throw new Error(`[@frigear-nu/push] push.fcm.serviceAccount has no "${name}".`)
  }
  return {
    projectId: projectId as string,
    clientEmail: clientEmail as string,
    privateKey: normalizePemKey(privateKey as string),
    tokenUri: typeof tokenUri === 'string' && tokenUri ? tokenUri : DEFAULT_TOKEN_URI,
  }
}

/** The signed RS256 JWT a service account exchanges for an OAuth access token (valid for an hour). */
export async function buildFcmAssertion(account: FcmServiceAccount, now: number = Date.now()): Promise<string> {
  const key = await importPKCS8(account.privateKey, 'RS256')
  const issuedAt = Math.floor(now / 1000)
  return new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.clientEmail)
    .setAudience(account.tokenUri)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 3600)
    .sign(key)
}

/** The FCM HTTP v1 request for one device. Data values must be strings; the url travels as `data.url`. */
export function buildFcmRequest(projectId: string, accessToken: string, message: DeviceMessage) {
  const data = { ...message.data, ...(message.url ? { url: message.url } : {}) }
  return {
    url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    headers: { 'authorization': `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: {
      message: {
        token: message.token,
        notification: { title: message.title, body: message.body },
        ...(Object.keys(data).length ? { data } : {}),
        android: { priority: 'HIGH' },
      },
    },
  }
}

type FcmError = { error?: { status?: string, message?: string, details?: { errorCode?: string }[] } }

/** Whether an FCM answer says the token will never work again. */
export function isDeadFcmToken(status: number, body: FcmError | undefined): boolean {
  if (status === 404) return true
  const error = body?.error
  if (error?.details?.some(detail => detail.errorCode === 'UNREGISTERED')) return true
  if (error?.status === 'NOT_FOUND') return true
  // A malformed token is a 400 INVALID_ARGUMENT about the registration token; any other 400 is about the payload.
  return status === 400 && error?.status === 'INVALID_ARGUMENT' && /registration token/i.test(error.message ?? '')
}

/**
 * A sender for one service account. It keeps the OAuth access token until a minute before it expires, so a burst of
 * pushes costs one token request.
 */
export function createFcmSender(account: FcmServiceAccount, env: ProviderEnvironment = {}): DeviceSender {
  const doFetch = env.fetch ?? callFetch
  const now = env.now ?? Date.now
  let cached: { token: string, expiresAt: number } | undefined
  let pending: Promise<string> | undefined

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt > now()) return cached.token
    pending ??= (async () => {
      try {
        const assertion = await buildFcmAssertion(account, now())
        const response = await doFetch(account.tokenUri, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
        })
        if (!response.ok) throw new Error(`FCM token request failed: ${await describeResponse(response)}`)
        const { access_token: token, expires_in: expiresIn } = await response.json() as { access_token?: string, expires_in?: number }
        if (!token) throw new Error('FCM token request returned no access_token.')
        cached = { token, expiresAt: now() + Math.max(0, (expiresIn ?? 3600) - 60) * 1000 }
        return token
      }
      finally {
        pending = undefined
      }
    })()
    return pending
  }

  return {
    async send(message): Promise<DeliveryOutcome> {
      try {
        const request = buildFcmRequest(account.projectId, await accessToken(), message)
        const response = await doFetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) })
        if (response.ok) return { status: 'sent' }
        const text = await response.text().catch(() => '')
        let body: FcmError | undefined
        try {
          body = JSON.parse(text) as FcmError
        }
        catch {
          body = undefined
        }
        const reason = `${response.status}${text ? ` ${text.slice(0, 300)}` : ''}`
        if (isDeadFcmToken(response.status, body)) return { status: 'dead', reason }
        // An expired access token the cache did not know about: forget it, the next send gets a fresh one.
        if (response.status === 401) cached = undefined
        return { status: 'failed', reason }
      }
      catch (error) {
        return { status: 'failed', reason: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
