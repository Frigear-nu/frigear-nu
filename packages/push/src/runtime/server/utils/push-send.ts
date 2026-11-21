import { db, schema } from '@nuxthub/db'
import { and, inArray, isNull } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { PushMessage, PushRuntimeConfig, SendPushResult } from '../../../types'
import { chunk } from '../../providers/chunk'
import { createPlatformSenders, resolvePushDriver } from '../../providers/config'
import type { PlatformSenders } from '../../providers/config'
import { deliverToDevices } from '../../providers/deliver'
import type { Http2Transport } from '../../providers/types'
import { readTranslated } from '../../utils/topics'

const pushConfig = () => useRuntimeConfig().push as PushRuntimeConfig

// One sender per credential set, so the OAuth token (FCM) and the JWT (APNs) are reused between pushes.
let senders: { key: string, value: PlatformSenders } | undefined
let http2Transport: Http2Transport | undefined

function platformSenders(config: PushRuntimeConfig): PlatformSenders {
  const key = JSON.stringify([config.fcm, config.apns, config.timeoutMs])
  if (senders?.key !== key) senders = { key, value: createPlatformSenders(config, { http2: http2Transport }) }
  return senders.value
}

/**
 * Replaces the transport APNs requests go through (`node:http2` by default). For a relay on a runtime without an HTTP/2
 * client (Cloudflare Workers: call it from a Nitro plugin), and for tests. `undefined` restores the default.
 */
export function setPushHttp2Transport(transport: Http2Transport | undefined): void {
  http2Transport = transport
  senders = undefined
}

let warnedLogDriver = false

/**
 * Sends a push notification to every active device of `message.userIds`: FCM for Android, APNs (over HTTP/2) for iOS. A
 * device whose token the provider reports as dead is revoked. Nothing here throws for a single device: failures are
 * counted (and logged) and the result tells how many devices were reached.
 *
 * `title` and `body` can be one text per locale: each device gets the text for the locale it registered with.
 *
 * With the `log` driver (the default until credentials are configured, see `push.settings.driver`) the push is only
 * written to the server log (title and user id, never the body) and counted as sent.
 *
 * This is a parallel API next to `@frigear-nu/notify`, which has no push driver yet: once notify implements
 * `push.driver`, this becomes that driver.
 */
export async function sendPush(_event: H3Event | undefined, message: PushMessage): Promise<SendPushResult> {
  const userIds = [...new Set(message.userIds)]
  if (!userIds.length) return { sent: 0, failed: 0, revoked: 0 }

  // Chunked: D1 allows 100 bound parameters per query.
  const devices = (await Promise.all(chunk(userIds).map(ids => db.select().from(schema.pushDevices)
    .where(and(inArray(schema.pushDevices.userId, ids), isNull(schema.pushDevices.revokedAt)))))).flat()
  if (!devices.length) return { sent: 0, failed: 0, revoked: 0 }

  const text = (value: PushMessage['title'], locale: string | null) => readTranslated(value, locale ?? 'en')
  const config = pushConfig()
  if (resolvePushDriver(config) === 'log') {
    if (!warnedLogDriver && process.env.NODE_ENV === 'production') {
      warnedLogDriver = true
      console.warn('[@frigear-nu/push] The log driver is active in production: pushes are only logged, not sent. Set the FCM / APNs credentials (NUXT_PUSH_*) or `push.settings.driver`.')
    }
    for (const device of devices) {
      console.info(`[@frigear-nu/push] (log driver) push "${text(message.title, device.locale)}" to user ${device.userId}, ${device.platform} device ${device.id}`)
    }
    return { sent: devices.length, failed: 0, revoked: 0 }
  }

  const { revokedIds, problems, ...result } = await deliverToDevices(devices, device => ({
    title: text(message.title, device.locale ?? null),
    body: text(message.body, device.locale ?? null),
    url: message.url,
    data: message.data,
  }), platformSenders(config))

  for (const ids of chunk(revokedIds)) {
    await db.update(schema.pushDevices).set({ revokedAt: new Date() }).where(inArray(schema.pushDevices.id, ids))
  }
  for (const problem of problems) console.warn(`[@frigear-nu/push] Delivery failed for ${problem}`)
  return result
}
